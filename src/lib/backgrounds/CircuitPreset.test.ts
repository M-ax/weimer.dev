import {describe, expect, test} from 'bun:test';
import {CircuitPreset} from './CircuitPreset';

type PinSide = 'top' | 'right' | 'bottom' | 'left';

interface TestPoint {
    x: number;
    y: number;
}

interface TestPin extends TestPoint {
    side: PinSide;
    used: boolean;
}

interface TestComponent {
    kind: 'cpu' | 'dip';
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    pins: TestPin[];
}

interface TestWire {
    points: TestPoint[];
    fromComponent?: TestComponent;
    toComponent?: TestComponent;
    fromPin?: TestPin;
    toPin?: TestPin;
}

interface CircuitPresetTestHarness {
    connectBus(from: TestComponent, to: TestComponent, random: () => number): boolean;
    connectPins(from: TestComponent, to: TestComponent, random: () => number): boolean;
    createCpu(scale: number, random: () => number): TestComponent;
    createDip(scale: number, random: () => number): TestComponent;
    connectAddedComponent(component: TestComponent, random: () => number): TestWire[];
    removalWireRange(wire: TestWire, component: TestComponent, progress: number): [number, number];
    advanceLifecycle(now: number): void;
    placeComponent(component: TestComponent, width: number, height: number, random: () => number): boolean;
    components: TestComponent[];
    wires: TestWire[];
    lifecycle: {
        phase: 'lifting' | 'erasing' | 'lowering' | 'growing';
        startedAt: number;
        component: TestComponent;
        wires: TestWire[];
    } | null;
}

const gridSize = 15;

const createComponent = (x: number, y: number, side: PinSide): TestComponent => {
    const horizontal = side === 'left' || side === 'right';
    const width = horizontal ? 60 : 120;
    const height = horizontal ? 120 : 60;

    return {
        kind: 'dip',
        x,
        y,
        width,
        height,
        label: 'test',
        pins: Array.from({length: 4}, (_, index) => ({
            x: horizontal ? (side === 'right' ? x + width : x) : x + 30 + index * gridSize,
            y: horizontal ? y + 30 + index * gridSize : (side === 'bottom' ? y + height : y),
            side,
            used: false,
        })),
    };
};

const connectBus = (from: TestComponent, to: TestComponent, obstacles: TestComponent[] = []) => {
    const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
    preset.components = [from, to, ...obstacles];

    return {connected: preset.connectBus(from, to, () => 0), wires: preset.wires};
};

const connectPins = (
    from: TestComponent,
    to: TestComponent,
    obstacles: TestComponent[] = [],
    wires: TestWire[] = [],
) => {
    const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
    preset.components = [from, to, ...obstacles];
    preset.wires = wires;

    return {connected: preset.connectPins(from, to, () => 0), wires: preset.wires};
};

const overlapLength = (firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) =>
    Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd))
    - Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd));

const hasOverlappingSegments = (wires: TestWire[]) => wires.some((wire, wireIndex) =>
    wires.slice(wireIndex + 1).some((otherWire) =>
        wire.points.slice(1).some((end, segmentIndex) =>
            otherWire.points.slice(1).some((otherEnd, otherSegmentIndex) => {
                const start = wire.points[segmentIndex];
                const otherStart = otherWire.points[otherSegmentIndex];
                const horizontalOverlap = start.y === end.y
                    && otherStart.y === otherEnd.y
                    && start.y === otherStart.y
                    && overlapLength(start.x, end.x, otherStart.x, otherEnd.x) > 0;
                const verticalOverlap = start.x === end.x
                    && otherStart.x === otherEnd.x
                    && start.x === otherStart.x
                    && overlapLength(start.y, end.y, otherStart.y, otherEnd.y) > 0;

                return horizontalOverlap || verticalOverlap;
            }),
        ),
    ),
);

const isCorner = (points: TestPoint[], index: number) => {
    const point = points[index];
    const previous = points.slice(0, index).reverse().find((candidate) =>
        candidate.x !== point.x || candidate.y !== point.y,
    );
    const next = points.slice(index + 1).find((candidate) =>
        candidate.x !== point.x || candidate.y !== point.y,
    );
    if (!previous || !next) return false;

    return (previous.y === point.y) !== (next.y === point.y);
};

const hasSharedCorners = (wires: TestWire[]) => wires.some((wire, wireIndex) =>
    wires.slice(wireIndex + 1).some((otherWire) =>
        wire.points.some((point, index) =>
            isCorner(wire.points, index)
            && otherWire.points.some((otherPoint, otherIndex) =>
                point.x === otherPoint.x
                && point.y === otherPoint.y
                && isCorner(otherWire.points, otherIndex),
            ),
        ),
    ),
);

describe('CircuitPreset component labels', () => {
    test('assigns TI-style part numbers to CPUs and DIP packages', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        const cpu = preset.createCpu(1, () => 0);
        const dip = preset.createDip(1, () => 0);

        expect(cpu.label).toMatch(/^(?:TMS320F28027|MSP430G2553|AM3352BZCZ60|TMS570LS1227|TMS320C5510)$/);
        expect(dip.label).toMatch(/^(?:SN74HC00N|SN74LS14N|CD74HC4060E|LM358P|TL072CP|NE555P)$/);
    });
});

describe('CircuitPreset bus routing', () => {
    test.each([
        ['east–west, short aligned', createComponent(0, 0, 'right'), createComponent(180, 0, 'left')],
        ['east–west, long aligned', createComponent(0, 0, 'right'), createComponent(300, 0, 'left')],
        ['east–west, one-cell offset', createComponent(0, 0, 'right'), createComponent(180, 15, 'left')],
        ['east–west, two-cell offset', createComponent(0, 0, 'right'), createComponent(300, 30, 'left')],
        ['west–east, one-cell offset', createComponent(300, 0, 'left'), createComponent(0, 15, 'right')],
        ['west–east, two-cell offset', createComponent(480, 0, 'left'), createComponent(0, 30, 'right')],
        ['north–south, short aligned', createComponent(0, 0, 'bottom'), createComponent(0, 180, 'top')],
        ['north–south, long aligned', createComponent(0, 0, 'bottom'), createComponent(0, 300, 'top')],
        ['north–south, one-cell offset', createComponent(0, 0, 'bottom'), createComponent(15, 180, 'top')],
        ['north–south, two-cell offset', createComponent(0, 0, 'bottom'), createComponent(30, 300, 'top')],
        ['south–north, one-cell offset', createComponent(0, 300, 'top'), createComponent(15, 0, 'bottom')],
        ['south–north, two-cell offset', createComponent(0, 480, 'top'), createComponent(30, 0, 'bottom')],
    ])('connects a two-component bus without wire overlap: %s', (_name, from, to) => {
        const {connected, wires} = connectBus(from, to);

        expect(connected).toBe(true);
        expect(wires).toHaveLength(3);
        expect(hasOverlappingSegments(wires)).toBe(false);
    });

    test('does not route a bus through an unrelated component', () => {
        const from = createComponent(0, 0, 'right');
        const to = createComponent(300, 0, 'left');
        const blocker = createComponent(150, 0, 'right');
        const {connected, wires} = connectBus(from, to, [blocker]);

        expect(connected).toBe(false);
        expect(wires).toHaveLength(0);
        expect(from.pins.every((pin) => !pin.used)).toBe(true);
        expect(to.pins.every((pin) => !pin.used)).toBe(true);
    });

    test('does not route a bus through an unrelated component exclusion zone', () => {
        const from = createComponent(0, 0, 'right');
        const to = createComponent(300, 0, 'left');
        const blocker = createComponent(150, 60, 'right');
        const {connected, wires} = connectBus(from, to, [blocker]);

        expect(connected).toBe(false);
        expect(wires).toHaveLength(0);
    });
});

describe('CircuitPreset trace clearance', () => {
    test('does not route a trace through an unrelated component', () => {
        const from = createComponent(0, 0, 'right');
        const to = createComponent(300, 0, 'left');
        const blocker = createComponent(150, 0, 'right');
        const {connected, wires} = connectPins(from, to, [blocker]);

        expect(connected).toBe(false);
        expect(wires).toHaveLength(0);
    });

    test('does not route a trace through an unrelated component exclusion zone', () => {
        const from = createComponent(0, 0, 'right');
        const to = createComponent(300, 0, 'left');
        const blocker = createComponent(150, 60, 'right');
        const {connected, wires} = connectPins(from, to, [blocker]);

        expect(connected).toBe(false);
        expect(wires).toHaveLength(0);
    });

    test('reroutes a trace rather than sharing a positive-length run with another trace', () => {
        const from = createComponent(0, 0, 'right');
        const to = createComponent(300, 0, 'left');
        const {connected, wires} = connectPins(from, to, [], [
            {points: [{x: 75, y: 45}, {x: 285, y: 45}]},
        ]);

        expect(connected).toBe(true);
        expect(wires).toHaveLength(2);
        expect(hasOverlappingSegments(wires)).toBe(false);
    });

    test('reroutes a trace rather than sharing a corner with another trace', () => {
        const from = createComponent(0, 0, 'right');
        const to = createComponent(300, 90, 'left');
        const {connected, wires} = connectPins(from, to, [], [
            {points: [{x: 150, y: 0}, {x: 180, y: 0}, {x: 180, y: 45}, {x: 240, y: 45}]},
        ]);

        expect(connected).toBe(true);
        expect(wires).toHaveLength(2);
        expect(hasSharedCorners(wires)).toBe(false);
    });

    test('allows a trace to cross another trace perpendicularly', () => {
        const from = createComponent(0, 0, 'right');
        const to = createComponent(300, 0, 'left');
        const {connected, wires} = connectPins(from, to, [], [
            {points: [{x: 180, y: 0}, {x: 180, y: 90}]},
        ]);

        expect(connected).toBe(true);
        expect(wires).toHaveLength(2);
    });
});

describe('CircuitPreset component lifecycle', () => {
    const createOwnedWire = (from: TestComponent, to: TestComponent) => ({
        points: [{x: 60, y: 45}, {x: 300, y: 45}],
        fromComponent: from,
        toComponent: to,
        fromPin: from.pins[1],
        toPin: to.pins[0],
    });

    test('erases a wire outward from whichever endpoint is being removed', () => {
        const source = createComponent(0, 0, 'right');
        const target = createComponent(300, 0, 'left');
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        const wire = createOwnedWire(source, target);

        expect(preset.removalWireRange(wire, source, 0.35)).toEqual([0.35, 1]);
        expect(preset.removalWireRange(wire, target, 0.35)).toEqual([0, 0.65]);
    });

    test('keeps connected components fixed until wire removal is complete', () => {
        const source = createComponent(0, 0, 'right');
        const target = createComponent(300, 0, 'left');
        const wire = createOwnedWire(source, target);
        source.pins[1].used = true;
        target.pins[0].used = true;
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        preset.components = [source, target];
        preset.wires = [wire];
        preset.lifecycle = {phase: 'erasing', startedAt: 0, component: source, wires: [wire]};

        preset.advanceLifecycle(1_000);

        expect(preset.components).toEqual([source, target]);
        expect(target.pins[0].used).toBe(true);

        preset.advanceLifecycle(1_751);

        expect(preset.components).toEqual([target]);
        expect(preset.wires).toHaveLength(0);
        expect(target.pins[0].used).toBe(false);
    });

    test('connects a lowered component to nearby components with free pins', () => {
        const added = createComponent(0, 0, 'right');
        const neighbor = createComponent(300, 0, 'left');
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        preset.components = [added, neighbor];

        const wires = preset.connectAddedComponent(added, () => 0);

        expect(wires).toHaveLength(3);
        expect(wires.every((wire) => wire.fromComponent === added && wire.toComponent === neighbor)).toBe(true);
    });

    test('spreads growing wires across multiple nearby components with free pins', () => {
        const added = createComponent(300, 300, 'right');
        added.pins = [
            {x: added.x, y: 345, side: 'left', used: false},
            {x: added.x + added.width, y: 345, side: 'right', used: false},
            {x: added.x, y: 360, side: 'left', used: false},
            {x: added.x + added.width, y: 360, side: 'right', used: false},
            {x: added.x, y: 375, side: 'left', used: false},
            {x: added.x + added.width, y: 375, side: 'right', used: false},
        ];
        const westNeighbor = createComponent(0, 300, 'right');
        const eastNeighbor = createComponent(600, 300, 'left');
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        preset.components = [added, westNeighbor, eastNeighbor];

        const wires = preset.connectAddedComponent(added, () => 0);

        expect(wires).toHaveLength(3);
        expect(wires.some((wire) => wire.toComponent === westNeighbor)).toBe(true);
        expect(wires.some((wire) => wire.toComponent === eastNeighbor)).toBe(true);
    });

    test('does not lower a replacement component through an existing trace', () => {
        const replacement = createComponent(0, 0, 'right');
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        preset.components = [];
        preset.wires = [{points: [{x: 0, y: 45}, {x: 300, y: 45}]}];

        expect(preset.placeComponent(replacement, 360, 240, () => 0)).toBe(false);
    });

    test('does not lower a replacement component into an existing trace exclusion zone', () => {
        const replacement = createComponent(0, 0, 'right');
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        preset.components = [];
        preset.wires = [{points: [{x: 0, y: 15}, {x: 300, y: 15}]}];

        expect(preset.placeComponent(replacement, 360, 240, () => 0)).toBe(false);
    });
});