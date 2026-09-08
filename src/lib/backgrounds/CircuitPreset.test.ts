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
    state?: number;
}

interface TestComponent {
    kind: 'cpu' | 'dip' | 'big_dip' | 'display';
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    rotation?: 0 | 90 | 180 | 270;
    pins: TestPin[];
    displayValues?: number[];
    displayUpdatedAt?: number;
}

interface TestWire {
    points: TestPoint[];
    fromComponent?: TestComponent;
    toComponent?: TestComponent;
    fromPin?: TestPin;
    toPin?: TestPin;
    phase?: number;
    isBus?: boolean;
    pulseDirection?: -1 | 1;
    lastPulseCycle?: number;
}

interface CircuitPresetTestHarness {
    resize(dimensions: {width: number; height: number; pixelRatio: number}): void;
    connectBus(from: TestComponent, to: TestComponent, random: () => number): boolean;
    connectPins(from: TestComponent, to: TestComponent, random: () => number): boolean;
    createCpu(scale: number, random: () => number): TestComponent;
    createDip(scale: number, random: () => number): TestComponent;
    createBigDip(scale: number, random: () => number): TestComponent;
    createDisplay(scale: number, random: () => number): TestComponent;
    advancePinStates(now: number): void;
    advanceDisplayGrid(component: TestComponent, now: number): number[];
    connectAddedComponent(component: TestComponent, random: () => number): TestWire[];
    removalWireRange(wire: TestWire, component: TestComponent, progress: number): [number, number];
    beginRemoval(now: number): void;
    selectRemovalBatch(candidates: TestComponent[], random: () => number): TestComponent[];
    advanceLifecycle(now: number): void;
    lifecycleProgress(now: number, component?: TestComponent): number;
    placeComponent(component: TestComponent, width: number, height: number, random: () => number): boolean;
    components: TestComponent[];
    wires: TestWire[];
    lifecycle: {
        phase: 'lifting' | 'erasing' | 'lowering' | 'growing';
        startedAt: number;
        components: TestComponent[];
        wires: TestWire[];
        wireSet: Set<TestWire>;
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

const connectBus = (
    from: TestComponent,
    to: TestComponent,
    obstacles: TestComponent[] = [],
    random: () => number = () => 0,
) => {
    const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
    preset.components = [from, to, ...obstacles];

    return {connected: preset.connectBus(from, to, random), wires: preset.wires};
};

const connectPins = (
    from: TestComponent,
    to: TestComponent,
    obstacles: TestComponent[] = [],
    wires: TestWire[] = [],
    random: () => number = () => 0,
) => {
    const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
    preset.components = [from, to, ...obstacles];
    preset.wires = wires;

    return {connected: preset.connectPins(from, to, random), wires: preset.wires};
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

    test('initializes every spawned pin with a numeric state', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;

        expect(preset.createCpu(1, () => 0.5).pins.every((pin) => Number.isFinite(pin.state))).toBe(true);
        expect(preset.createDip(1, () => 0.5).pins.every((pin) => Number.isFinite(pin.state))).toBe(true);
    });

    test('fills each regular DIP side with the missing pin', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        const dip = preset.createDip(1, () => 0.5);
        const leftPins = dip.pins.filter((pin) => pin.side === 'left').sort((left, right) => left.y - right.y);
        const rightPins = dip.pins.filter((pin) => pin.side === 'right').sort((left, right) => left.y - right.y);

        expect(dip.pins.filter((pin) => pin.side === 'bottom')).toHaveLength(0);
        expect(leftPins).toHaveLength(6);
        expect(rightPins).toHaveLength(6);
        expect(leftPins.every((pin, index) => index === 0 || pin.y - leftPins[index - 1].y === gridSize)).toBe(true);
        expect(rightPins.every((pin, index) => index === 0 || pin.y - rightPins[index - 1].y === gridSize)).toBe(true);
    });

    test('creates big DIPs with the additional lower pin banks', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        const dip = preset.createBigDip(1, () => 0);
        const leftPins = dip.pins.filter((pin) => pin.side === 'left').sort((left, right) => left.y - right.y);
        const rightPins = dip.pins.filter((pin) => pin.side === 'right').sort((left, right) => left.y - right.y);

        expect(dip.kind).toBe('big_dip');
        expect(dip.pins.filter((pin) => pin.side === 'bottom')).toHaveLength(0);
        expect(leftPins).toHaveLength(8);
        expect(rightPins).toHaveLength(8);
        expect(leftPins[4].y - leftPins[3].y).toBeGreaterThan(gridSize * 2);
        expect(rightPins[4].y - rightPins[3].y).toBeGreaterThan(gridSize * 2);
    });

    test('creates DIPs in all four right-angle orientations', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;

        ([
            [0, 0],
            [0.25, 90],
            [0.5, 180],
            [0.75, 270],
        ] as const).forEach(([randomValue, rotation]) => {
            const dip = preset.createDip(1, () => randomValue);

            expect(dip.rotation).toBe(rotation);
            expect(dip.width > dip.height).toBe(rotation === 90 || rotation === 270);
        });
    });

    test('creates four grid-aligned inputs on each display edge', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        const display = preset.createDisplay(1, () => 0);

        (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
            const pins = display.pins.filter((pin) => pin.side === side);
            const axis = side === 'top' || side === 'bottom' ? 'x' : 'y';

            expect(pins).toHaveLength(4);
            expect(pins.every((pin) => pin[axis] % gridSize === 0)).toBe(true);
        });
    });

    test('places multiple displays on larger circuit fields', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        (preset as unknown as {renderStaticLayer: () => void}).renderStaticLayer = () => {};

        preset.resize({width: 1_600, height: 1_000, pixelRatio: 1});

        const displays = preset.components.filter((component) => component.kind === 'display');
        expect(displays.length).toBeGreaterThan(1);
        expect(new Set(displays.map((display) => `${display.x}:${display.y}`)).size).toBe(displays.length);
    });

    test('connects every component on a compact circuit field', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        (preset as unknown as {renderStaticLayer: () => void}).renderStaticLayer = () => {};

        preset.resize({width: 800, height: 600, pixelRatio: 1});

        expect(preset.components.every((component) => preset.wires.some((wire) =>
            wire.fromComponent === component || wire.toComponent === component,
        ))).toBe(true);
    });

    test('creates a dense initial network without isolated components', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        (preset as unknown as {renderStaticLayer: () => void}).renderStaticLayer = () => {};

        preset.resize({width: 1_600, height: 1_000, pixelRatio: 1});

        expect(preset.wires.length).toBeGreaterThan(24);
        expect(preset.components.every((component) => preset.wires.some((wire) =>
            wire.fromComponent === component || wire.toComponent === component,
        ))).toBe(true);
    });

    test('raises a sending pin state and lowers a receiving pin state once per pulse cycle', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        const source = preset.createCpu(1, () => 0.5);
        const destination = preset.createDip(1, () => 0.5);
        const fromPin = source.pins[0];
        const toPin = destination.pins[0];
        preset.wires = [{
            points: [fromPin, toPin],
            fromComponent: source,
            toComponent: destination,
            fromPin,
            toPin,
            phase: 0,
            isBus: false,
            lastPulseCycle: -1,
        }];

        preset.advancePinStates(7_000);

        expect(fromPin.state).toBeGreaterThan(0.5);
        expect(toPin.state).toBeLessThan(0.5);
    });

    test('randomizes trace direction and keeps all bus pulses moving together', () => {
        const forwardTrace = connectPins(createComponent(0, 0, 'right'), createComponent(300, 0, 'left'));
        const reverseTrace = connectPins(
            createComponent(0, 0, 'right'),
            createComponent(300, 0, 'left'),
            [],
            [],
            () => 0.75,
        );
        const bus = connectBus(
            createComponent(0, 0, 'right'),
            createComponent(300, 0, 'left'),
            [],
            () => 0.75,
        );

        expect(forwardTrace.wires[0].pulseDirection).toBe(1);
        expect(reverseTrace.wires[0].pulseDirection).toBe(-1);
        expect(bus.connected).toBe(true);
        expect(bus.wires.map((wire) => wire.pulseDirection)).toEqual([-1, -1, -1]);
    });

    test('uses an eight-by-eight display grid that eases toward changed pin states', () => {
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        const display = preset.createDisplay(1, () => 0.5);

        preset.advanceDisplayGrid(display, 0);
        const initialValue = display.displayValues![0];
        expect(display.displayValues).toHaveLength(64);

        display.pins.forEach((pin) => {
            pin.state = 1;
        });
        preset.advanceDisplayGrid(display, 100);
        const transitioningValue = display.displayValues![0];
        preset.advanceDisplayGrid(display, 700);

        expect(transitioningValue).toBeGreaterThan(initialValue);
        expect(transitioningValue).toBeLessThan(1);
        expect(display.displayValues![0]).toBeGreaterThan(transitioningValue);
        expect(display.displayValues![0]).toBeLessThan(1);
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
        preset.lifecycle = {
            phase: 'erasing',
            startedAt: 0,
            components: [source],
            wires: [wire],
            wireSet: new Set([wire]),
        };

        preset.advanceLifecycle(1_000);

        expect(preset.components).toEqual([source, target]);
        expect(target.pins[0].used).toBe(true);

        preset.advanceLifecycle(1_751);

        expect(preset.components).toEqual([target]);
        expect(preset.wires).toHaveLength(0);
        expect(target.pins[0].used).toBe(false);
    });

    test('selects up to three mutually unconnected components with unique adjacent wires', () => {
        const first = createComponent(0, 0, 'right');
        const second = createComponent(300, 0, 'left');
        const third = createComponent(0, 180, 'right');
        const fourth = createComponent(300, 180, 'left');
        const fifth = createComponent(0, 360, 'right');
        const sixth = createComponent(300, 360, 'left');
        const wires = [
            createOwnedWire(first, second),
            createOwnedWire(third, fourth),
            createOwnedWire(fifth, sixth),
        ];
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        preset.components = [first, second, third, fourth, fifth, sixth];
        preset.wires = wires;

        const selected = preset.selectRemovalBatch(preset.components, () => 0.99);
        const selectedWires = wires.filter((wire) =>
            selected.includes(wire.fromComponent!) || selected.includes(wire.toComponent!),
        );

        expect(selected).toEqual([sixth, fourth, second]);
        expect(selected).toHaveLength(3);
        expect(new Set(selectedWires).size).toBe(selectedWires.length);
        expect(selectedWires.every((wire) =>
            !(selected.includes(wire.fromComponent!) && selected.includes(wire.toComponent!)),
        )).toBe(true);
    });

    test('removes every component in a batch before adding replacements', () => {
        const first = createComponent(0, 0, 'right');
        const second = createComponent(300, 0, 'left');
        const survivor = createComponent(600, 0, 'left');
        const firstWire = createOwnedWire(first, second);
        const secondWire = createOwnedWire(second, survivor);
        first.pins[1].used = true;
        second.pins[0].used = true;
        second.pins[1].used = true;
        survivor.pins[0].used = true;
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        preset.components = [first, second, survivor];
        preset.wires = [firstWire, secondWire];
        preset.lifecycle = {
            phase: 'erasing',
            startedAt: 0,
            components: [first, second],
            wires: [firstWire, secondWire],
            wireSet: new Set([firstWire, secondWire]),
        };

        preset.advanceLifecycle(1_901);

        expect(preset.components).toEqual([survivor]);
        expect(preset.wires).toHaveLength(0);
        expect(survivor.pins[0].used).toBe(false);
    });

    test('staggers component lifting within a removal batch', () => {
        const first = createComponent(0, 0, 'right');
        const second = createComponent(300, 0, 'left');
        const third = createComponent(0, 180, 'right');
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        preset.lifecycle = {
            phase: 'lifting',
            startedAt: 0,
            components: [first, second, third],
            wires: [],
            wireSet: new Set(),
        };

        expect(preset.lifecycleProgress(900, first)).toBe(1);
        expect(preset.lifecycleProgress(900, second)).toBeLessThan(1);
        expect(preset.lifecycleProgress(900, third)).toBeLessThan(preset.lifecycleProgress(900, second));
        preset.advanceLifecycle(900);

        expect(preset.lifecycle?.phase).toBe('lifting');
    });

    test('staggers component lowering within an addition batch', () => {
        const first = createComponent(0, 0, 'right');
        const second = createComponent(300, 0, 'left');
        const third = createComponent(0, 180, 'right');
        const preset = new CircuitPreset() as unknown as CircuitPresetTestHarness;
        preset.components = [first, second, third];
        preset.lifecycle = {
            phase: 'lowering',
            startedAt: 0,
            components: [first, second, third],
            wires: [],
            wireSet: new Set(),
        };

        expect(preset.lifecycleProgress(900, first)).toBe(1);
        expect(preset.lifecycleProgress(900, second)).toBeLessThan(1);
        expect(preset.lifecycleProgress(900, third)).toBeLessThan(preset.lifecycleProgress(900, second));
        preset.advanceLifecycle(900);

        expect(preset.lifecycle?.phase).toBe('lowering');
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