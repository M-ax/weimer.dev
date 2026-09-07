import type {BackgroundDimensions, BackgroundFrame, LayeredBackgroundPreset} from './types';

type PinSide = 'top' | 'right' | 'bottom' | 'left';
type CpuCorner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';

interface CircuitPoint {
    x: number;
    y: number;
}

type CircuitRenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface CircuitPin extends CircuitPoint {
    side: PinSide;
    used: boolean;
}

interface CircuitComponent {
    kind: 'cpu' | 'dip';
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    markerCorner?: CpuCorner;
    pins: CircuitPin[];
}

interface CircuitWire {
    points: CircuitPoint[];
    segmentLengths: number[];
    totalLength: number;
    phase: number;
    isBus: boolean;
    fromComponent: CircuitComponent;
    toComponent: CircuitComponent;
    fromPin: CircuitPin;
    toPin: CircuitPin;
}

type CircuitLifecyclePhase = 'lifting' | 'erasing' | 'lowering' | 'growing';

interface CircuitLifecycle {
    phase: CircuitLifecyclePhase;
    startedAt: number;
    components: CircuitComponent[];
    wires: CircuitWire[];
    wireSet: Set<CircuitWire>;
}

interface CircuitLayout {
    width: number;
    height: number;
    pixelRatio: number;
    scale: number;
}

export class CircuitPreset implements LayeredBackgroundPreset {
    readonly name = 'circuit' as const;
    readonly label = 'Circuit field';
    readonly hasDynamicContent = true;
    private readonly gridSize = 15;
    private readonly busLaneSpacing = this.gridSize;
    private readonly componentExclusionZone = this.gridSize * 2;
    private readonly lifecycleInterval = 12_000;
    private readonly componentTransitionDuration = 900;
    private readonly wireTransitionDuration = 1_750;
    private components: CircuitComponent[] = [];
    private wires: CircuitWire[] = [];
    private staticLayer: HTMLCanvasElement | OffscreenCanvas | null = null;
    private lifecycle: CircuitLifecycle | null = null;
    private layout: CircuitLayout | null = null;
    private nextLifecycleAt = 0;
    private transitionSeed = 0;
    private _staticVersion = 0;

    get staticVersion() {
        return this._staticVersion;
    }

    resize({width, height, pixelRatio}: BackgroundDimensions) {
        const seed = Math.round(width) * 73_856_093 ^ Math.round(height) * 19_349_663;
        const random = this.createRandom(seed);
        const scale = Math.max(0.72, Math.min(1.12, Math.sqrt((width * height) / 850_000)));
        const area = width * height;
        const cpuCount = Math.max(2, Math.min(5, Math.ceil(area / 520_000)));
        const dipCount = Math.max(4, Math.min(15, Math.ceil(area / 125_000)));

        this.components = [];
        this.wires = [];
        this.lifecycle = null;
        this.layout = {width, height, pixelRatio, scale};
        this.nextLifecycleAt = 0;
        this.transitionSeed = seed;

        for (let index = 0; index < cpuCount; index += 1) {
            const component = this.createCpu(scale, random);
            if (this.placeComponent(component, width, height, random)) this.components.push(component);
        }
        for (let index = 0; index < dipCount; index += 1) {
            const component = this.createDip(scale, random);
            if (this.placeComponent(component, width, height, random)) this.components.push(component);
        }

        const pairedComponents = new Set<string>();
        const cpus = this.components.filter((component) => component.kind === 'cpu');
        cpus.forEach((cpu) => {
            for (const neighbor of this.nearestComponents(cpu)) {
                const key = this.componentPairKey(cpu, neighbor);
                if (pairedComponents.has(key) || this.componentDistance(cpu, neighbor) <= 92) continue;
                if (!this.connectBus(cpu, neighbor, random)) continue;
                pairedComponents.add(key);
                break;
            }
        });

        cpus.forEach((cpu, index) => {
            for (let connection = 0; connection < 5; connection += 1) {
                const neighbor = this.nearestComponents(cpu).find((component, neighborIndex) =>
                    neighborIndex >= connection % 2 && this.hasFreeFacingPins(cpu, component),
                );
                if (neighbor) this.connectPins(cpu, neighbor, random);
            }
            if (index % 2 === 0) this.connectPins(cpu, this.nearestComponents(cpu)[0], random);
        });

        this.components.forEach((component, index) => {
            const neighbors = this.nearestComponents(component);
            for (let connection = 0; connection < 2; connection += 1) {
                const neighbor = neighbors[(index + connection) % Math.min(neighbors.length, 3)];
                if (neighbor) this.connectPins(component, neighbor, random);
            }
        });

        this.renderStaticLayer(width, height, pixelRatio);
    }

    draw(context: CanvasRenderingContext2D, frame: BackgroundFrame) {
        this.prepareFrame(frame);
        this.drawStatic(context, frame);
        this.drawDynamic(context, frame);
    }

    prepareFrame({now}: BackgroundFrame) {
        this.advanceLifecycle(now);
    }

    drawStatic(context: CanvasRenderingContext2D, {width, height}: BackgroundFrame) {
        context.save();
        if (this.staticLayer) context.drawImage(this.staticLayer, 0, 0, width, height);
        else this.drawStaticCircuit(context, width, height, 0, this.lifecycle);
        context.restore();
    }

    drawDynamic(context: CanvasRenderingContext2D, {now}: BackgroundFrame) {
        context.save();
        this.drawLifecycle(context, now);
        const lifecycleWires = this.lifecycle?.wireSet;
        this.wires.forEach((wire) => {
            if (!lifecycleWires?.has(wire)) this.drawPulse(context, wire, now);
        });
        context.restore();
    }

    private createCpu(scale: number, random: () => number): CircuitComponent {
        const width = this.gridSize * Math.max(6, Math.round((8 + random() * 2) * scale));
        const height = this.gridSize * Math.max(5, Math.round((6 + random() * 2) * scale));
        const markerCorner: CpuCorner[] = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
        const component: CircuitComponent = {
            kind: 'cpu',
            x: 0,
            y: 0,
            width,
            height,
            label: this.createPartNumber('cpu', random),
            markerCorner: markerCorner[Math.floor(random() * markerCorner.length)],
            pins: [],
        };
        const pinsPerSide = 4;
        for (let index = 0; index < pinsPerSide; index += 1) {
            component.pins.push(
                {x: 0, y: 0, side: 'top', used: false},
                {x: 0, y: 0, side: 'right', used: false},
                {x: 0, y: 0, side: 'bottom', used: false},
                {x: 0, y: 0, side: 'left', used: false},
            );
        }
        this.positionPins(component);
        return component;
    }

    private createDip(scale: number, random: () => number): CircuitComponent {
        const pinRows = 4 + Math.floor(random() * 3);
        const width = this.gridSize * Math.max(3, Math.round((3.5 + random()) * scale));
        const height = this.gridSize * (pinRows + 2);
        const component: CircuitComponent = {
            kind: 'dip',
            x: 0,
            y: 0,
            width,
            height,
            label: this.createPartNumber('dip', random),
            pins: [],
        };
        for (let row = 0; row < pinRows; row += 1) {
            component.pins.push(
                {x: 0, y: 0, side: 'left', used: false},
                {x: 0, y: 0, side: 'right', used: false},
            );
        }
        this.positionPins(component);
        return component;
    }

    private createPartNumber(kind: CircuitComponent['kind'], random: () => number) {
        const partNumbers = kind === 'cpu'
            ? ['TMS320F28027', 'MSP430G2553', 'AM3352BZCZ60', 'TMS570LS1227', 'TMS320C5510']
            : ['SN74HC00N', 'SN74LS14N', 'CD74HC4060E', 'LM358P', 'TL072CP', 'NE555P'];
        return partNumbers[Math.floor(random() * partNumbers.length)];
    }

    private placeComponent(component: CircuitComponent, width: number, height: number, random: () => number) {
        const margin = this.componentExclusionZone;
        const padding = this.componentExclusionZone;
        for (let attempt = 0; attempt < 120; attempt += 1) {
            component.x = this.randomGridCoordinate(margin, width - component.width - margin, random);
            component.y = this.randomGridCoordinate(margin, height - component.height - margin, random);
            this.positionPins(component);
            const overlaps = this.components.some((other) =>
                component.x - padding < other.x + other.width &&
                component.x + component.width + padding > other.x &&
                component.y - padding < other.y + other.height &&
                component.y + component.height + padding > other.y,
            );
            const crossesWire = this.wires.some((wire) => wire.points.slice(1).some((end, index) =>
                this.segmentCrossesComponent(wire.points[index], end, component),
            ));
            if (!overlaps && !crossesWire) return true;
        }
        return false;
    }

    private positionPins(component: CircuitComponent) {
        if (component.kind === 'cpu') {
            const pinsPerSide = component.pins.length / 4;
            for (let index = 0; index < pinsPerSide; index += 1) {
                const horizontal = component.x + this.pinOffset(component.width, index, pinsPerSide);
                const vertical = component.y + this.pinOffset(component.height, index, pinsPerSide);
                const pinIndex = index * 4;
                component.pins[pinIndex] = {x: horizontal, y: component.y, side: 'top', used: false};
                component.pins[pinIndex + 1] = {
                    x: component.x + component.width,
                    y: vertical,
                    side: 'right',
                    used: false
                };
                component.pins[pinIndex + 2] = {
                    x: horizontal,
                    y: component.y + component.height,
                    side: 'bottom',
                    used: false
                };
                component.pins[pinIndex + 3] = {x: component.x, y: vertical, side: 'left', used: false};
            }
            return;
        }

        const pinRows = component.pins.length / 2;
        for (let row = 0; row < pinRows; row += 1) {
            const vertical = component.y + (row + 1) * this.gridSize;
            component.pins[row * 2] = {x: component.x, y: vertical, side: 'left', used: false};
            component.pins[row * 2 + 1] = {
                x: component.x + component.width,
                y: vertical,
                side: 'right',
                used: false
            };
        }
    }

    private nearestComponents(component: CircuitComponent) {
        return this.components
            .filter((candidate) => candidate !== component)
            .sort((left, right) => this.componentDistance(component, left) - this.componentDistance(component, right));
    }

    private componentDistance(left: CircuitComponent, right: CircuitComponent) {
        const leftCenter = this.componentCenter(left);
        const rightCenter = this.componentCenter(right);
        return Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
    }

    private componentCenter(component: CircuitComponent): CircuitPoint {
        return {x: component.x + component.width / 2, y: component.y + component.height / 2};
    }

    private componentPairKey(left: CircuitComponent, right: CircuitComponent) {
        return [this.components.indexOf(left), this.components.indexOf(right)].sort((a, b) => a - b).join(':');
    }

    private hasFreeFacingPins(from: CircuitComponent, to: CircuitComponent) {
        const fromSide = this.facingSide(from, to);
        const toSide = this.oppositeSide(fromSide);
        return this.freePins(from, fromSide).length > 0 && this.freePins(to, toSide).length > 0;
    }

    private connectBus(from: CircuitComponent, to: CircuitComponent, random: () => number) {
        const fromSide = this.facingSide(from, to);
        const toSide = this.oppositeSide(fromSide);
        const available = Math.min(this.freePins(from, fromSide).length, this.freePins(to, toSide).length);
        const count = Math.min(5, Math.floor(available * 0.8));
        if (count < 3) return false;

        for (const fromPins of this.adjacentPinGroups(from, fromSide, count)) {
            for (const toPins of this.adjacentPinGroups(to, toSide, count)) {
                if (!this.hasBusClearance(fromPins, toPins, count)) continue;
                const wires = fromPins.map((pin, index) =>
                    this.createWire(from, pin, to, toPins[index], random(), true, index, count),
                );
                if (!this.canAddWires(wires, [from, to])) continue;

                fromPins.forEach((pin, index) => {
                    pin.used = true;
                    toPins[index].used = true;
                });
                this.wires.push(...wires);
                return true;
            }
        }
        return false;
    }

    private hasBusClearance(fromPins: CircuitPin[], toPins: CircuitPin[], count: number) {
        const fromDirection = this.sideDirection(fromPins[0].side);
        const toDirection = this.sideDirection(toPins[0].side);
        const fromOuter = {
            x: fromPins[0].x + fromDirection.x * this.gridSize,
            y: fromPins[0].y + fromDirection.y * this.gridSize,
        };
        const toOuter = {
            x: toPins[0].x + toDirection.x * this.gridSize,
            y: toPins[0].y + toDirection.y * this.gridSize,
        };
        const span = fromPins[0].side === 'left' || fromPins[0].side === 'right'
            ? Math.abs(toOuter.x - fromOuter.x)
            : Math.abs(toOuter.y - fromOuter.y);
        const laneReach = (count - 1) * this.busLaneSpacing;
        return span >= laneReach * 2 + this.gridSize * 2;
    }

    private connectPins(from: CircuitComponent, to: CircuitComponent | undefined, random: () => number) {
        if (!to) return false;
        const fromSide = this.facingSide(from, to);
        const toSide = this.oppositeSide(fromSide);
        for (const [fromPin] of this.adjacentPinGroups(from, fromSide, 1)) {
            for (const [toPin] of this.adjacentPinGroups(to, toSide, 1)) {
                const wire = this.createWire(from, fromPin, to, toPin, random(), false, 0, 1);
                if (!this.canAddWires([wire], [from, to])) continue;

                fromPin.used = true;
                toPin.used = true;
                this.wires.push(wire);
                return true;
            }
        }
        return false;
    }

    private freePins(component: CircuitComponent, side: PinSide) {
        return component.pins.filter((pin) => pin.side === side && !pin.used);
    }

    private adjacentPinGroups(component: CircuitComponent, side: PinSide, count: number) {
        const pins = component.pins.filter((pin) => pin.side === side);
        const starts = Array.from({length: pins.length - count + 1}, (_, index) => index)
            .sort((left, right) => Math.abs(left - (pins.length - count) / 2) - Math.abs(right - (pins.length - count) / 2));
        return starts
            .map((start) => pins.slice(start, start + count))
            .filter((adjacentPins) => adjacentPins.every((pin) => !pin.used));
    }

    private facingSide(from: CircuitComponent, to: CircuitComponent): PinSide {
        const fromCenter = this.componentCenter(from);
        const toCenter = this.componentCenter(to);
        if (Math.abs(toCenter.x - fromCenter.x) >= Math.abs(toCenter.y - fromCenter.y)) {
            return toCenter.x >= fromCenter.x ? 'right' : 'left';
        }
        return toCenter.y >= fromCenter.y ? 'bottom' : 'top';
    }

    private oppositeSide(side: PinSide): PinSide {
        return {top: 'bottom', right: 'left', bottom: 'top', left: 'right'}[side];
    }

    private createWire(
        fromComponent: CircuitComponent,
        from: CircuitPin,
        toComponent: CircuitComponent,
        to: CircuitPin,
        phase: number,
        isBus: boolean,
        index: number,
        count: number,
    ): CircuitWire {
        const fromDirection = this.sideDirection(from.side);
        const toDirection = this.sideDirection(to.side);
        const fromOuter = {x: from.x + fromDirection.x * this.gridSize, y: from.y + fromDirection.y * this.gridSize};
        const toOuter = {x: to.x + toDirection.x * this.gridSize, y: to.y + toDirection.y * this.gridSize};
        const laneOffset = isBus ? (index - (count - 1) / 2) * this.busLaneSpacing : 0;
        const horizontalDirection = Math.sign(toOuter.x - fromOuter.x);
        const verticalDirection = Math.sign(toOuter.y - fromOuter.y);

        if (from.side === 'left' || from.side === 'right') {
            const laneDirection = verticalDirection === 0 ? 1 : -horizontalDirection * verticalDirection;
            const channelX = this.snapToGrid((fromOuter.x + toOuter.x) / 2) + laneOffset * laneDirection;
            return this.createMeasuredWire(
                [from, fromOuter, {x: channelX, y: fromOuter.y}, {x: channelX, y: toOuter.y}, toOuter, to],
                phase,
                isBus,
                fromComponent,
                from,
                toComponent,
                to,
            );
        }
        const laneDirection = horizontalDirection === 0 ? 1 : -horizontalDirection * verticalDirection;
        const channelY = this.snapToGrid((fromOuter.y + toOuter.y) / 2) + laneOffset * laneDirection;
        return this.createMeasuredWire(
            [from, fromOuter, {x: fromOuter.x, y: channelY}, {x: toOuter.x, y: channelY}, toOuter, to],
            phase,
            isBus,
            fromComponent,
            from,
            toComponent,
            to,
        );
    }

    private createMeasuredWire(
        points: CircuitPoint[],
        phase: number,
        isBus: boolean,
        fromComponent: CircuitComponent,
        fromPin: CircuitPin,
        toComponent: CircuitComponent,
        toPin: CircuitPin,
    ): CircuitWire {
        const segmentLengths = points.slice(1).map((point, index) =>
            Math.hypot(point.x - points[index].x, point.y - points[index].y),
        );
        return {
            points,
            segmentLengths,
            totalLength: segmentLengths.reduce((total, length) => total + length, 0),
            phase,
            isBus,
            fromComponent,
            toComponent,
            fromPin,
            toPin,
        };
    }

    private canAddWires(wires: CircuitWire[], connectedComponents: CircuitComponent[]) {
        const routedWires = [...this.wires];
        for (const wire of wires) {
            if (this.wireCrossesComponent(wire, connectedComponents)) return false;
            if (routedWires.some((otherWire) =>
                this.wiresOverlap(wire, otherWire) || this.wiresShareCorner(wire, otherWire),
            )) return false;
            routedWires.push(wire);
        }
        return true;
    }

    private wireCrossesComponent(wire: CircuitWire, connectedComponents: CircuitComponent[]) {
        return this.components.some((component) =>
            !connectedComponents.includes(component)
            && wire.points.slice(1).some((end, index) =>
                this.segmentCrossesComponent(wire.points[index], end, component),
            ),
        );
    }

    private segmentCrossesComponent(start: CircuitPoint, end: CircuitPoint, component: CircuitComponent) {
        const zone = this.componentExclusionZone;
        const minimumX = component.x - zone;
        const maximumX = component.x + component.width + zone;
        const minimumY = component.y - zone;
        const maximumY = component.y + component.height + zone;
        if (start.y === end.y) {
            return start.y >= minimumY
                && start.y <= maximumY
                && this.overlapLength(start.x, end.x, minimumX, maximumX) > 0;
        }
        return start.x >= minimumX
            && start.x <= maximumX
            && this.overlapLength(start.y, end.y, minimumY, maximumY) > 0;
    }

    private wiresOverlap(left: CircuitWire, right: CircuitWire) {
        return left.points.slice(1).some((end, index) =>
            right.points.slice(1).some((otherEnd, otherIndex) => {
                const start = left.points[index];
                const otherStart = right.points[otherIndex];
                const horizontalOverlap = start.y === end.y
                    && otherStart.y === otherEnd.y
                    && start.y === otherStart.y
                    && this.overlapLength(start.x, end.x, otherStart.x, otherEnd.x) > 0;
                const verticalOverlap = start.x === end.x
                    && otherStart.x === otherEnd.x
                    && start.x === otherStart.x
                    && this.overlapLength(start.y, end.y, otherStart.y, otherEnd.y) > 0;

                return horizontalOverlap || verticalOverlap;
            }),
        );
    }

    private wiresShareCorner(left: CircuitWire, right: CircuitWire) {
        return left.points.some((point, index) =>
            this.isWireCorner(left.points, index)
            && right.points.some((otherPoint, otherIndex) =>
                point.x === otherPoint.x
                && point.y === otherPoint.y
                && this.isWireCorner(right.points, otherIndex),
            ),
        );
    }

    private isWireCorner(points: CircuitPoint[], index: number) {
        const point = points[index];
        let previous: CircuitPoint | undefined;
        let next: CircuitPoint | undefined;

        for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
            const candidate = points[previousIndex];
            if (candidate.x === point.x && candidate.y === point.y) continue;
            previous = candidate;
            break;
        }
        for (let nextIndex = index + 1; nextIndex < points.length; nextIndex += 1) {
            const candidate = points[nextIndex];
            if (candidate.x === point.x && candidate.y === point.y) continue;
            next = candidate;
            break;
        }
        if (!previous || !next) return false;

        return (previous.y === point.y) !== (next.y === point.y);
    }

    private overlapLength(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
        return Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd))
            - Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd));
    }

    private advanceLifecycle(now: number) {
        if (!this.lifecycle) {
            if (!this.nextLifecycleAt) {
                this.nextLifecycleAt = now + this.lifecycleInterval;
                return;
            }
            if (now >= this.nextLifecycleAt) this.beginRemoval(now);
            return;
        }

        const progress = this.lifecycleProgress(now);
        if (progress < 1) return;

        if (this.lifecycle.phase === 'lifting') {
            this.lifecycle.phase = 'erasing';
            this.lifecycle.startedAt = now;
            return;
        }
        if (this.lifecycle.phase === 'erasing') {
            this.finishRemoval(now);
            return;
        }
        if (this.lifecycle.phase === 'lowering') {
            this.beginWireGrowth(now);
            return;
        }
        this.completeLifecycle(now);
    }

    private beginRemoval(now: number) {
        const candidates = this.components.filter((component) =>
            this.wires.some((wire) => wire.fromComponent === component || wire.toComponent === component),
        );
        if (!candidates.length) {
            this.nextLifecycleAt = now + this.lifecycleInterval;
            return;
        }

        const random = this.createTransitionRandom();
        const components = this.selectRemovalBatch(candidates, random);
        const selectedComponents = new Set(components);
        const wires = this.wires.filter((wire) =>
            selectedComponents.has(wire.fromComponent) || selectedComponents.has(wire.toComponent),
        );
        this.lifecycle = {
            phase: 'lifting',
            startedAt: now,
            components,
            wires,
            wireSet: new Set(wires),
        };
        this.refreshStaticLayer();
    }

    private selectRemovalBatch(candidates: CircuitComponent[], random: () => number) {
        const targetSize = 1 + Math.floor(random() * Math.min(3, candidates.length));
        const remaining = [...candidates];
        const selected: CircuitComponent[] = [];

        while (selected.length < targetSize) {
            const eligible = remaining.filter((candidate) => selected.every((component) =>
                !this.wires.some((wire) =>
                    (wire.fromComponent === component && wire.toComponent === candidate)
                    || (wire.fromComponent === candidate && wire.toComponent === component),
                ),
            ));
            if (!eligible.length) break;

            const component = eligible[Math.floor(random() * eligible.length)];
            selected.push(component);
            remaining.splice(remaining.indexOf(component), 1);
        }

        return selected;
    }

    private finishRemoval(now: number) {
        const lifecycle = this.lifecycle;
        if (!lifecycle) return;

        const removedComponents = new Set(lifecycle.components);
        lifecycle.wires.forEach((wire) => {
            if (!removedComponents.has(wire.fromComponent)) wire.fromPin.used = false;
            if (!removedComponents.has(wire.toComponent)) wire.toPin.used = false;
        });
        this.wires = this.wires.filter((wire) => !lifecycle.wireSet.has(wire));
        this.components = this.components.filter((component) => !removedComponents.has(component));
        this.lifecycle = null;
        this.beginAddition(now, lifecycle.components);
    }

    private beginAddition(now: number, removedComponents: CircuitComponent[]) {
        if (!this.layout) return;

        const random = this.createTransitionRandom();
        const components: CircuitComponent[] = [];
        for (const removedComponent of removedComponents) {
            const component = removedComponent.kind === 'cpu'
                ? this.createCpu(this.layout.scale, random)
                : this.createDip(this.layout.scale, random);
            if (this.placeComponent(component, this.layout.width, this.layout.height, random)) {
                this.components.push(component);
                components.push(component);
                continue;
            }

            this.components.splice(this.components.length - components.length, components.length);
            this.nextLifecycleAt = now + this.lifecycleInterval;
            this.refreshStaticLayer();
            return;
        }

        this.lifecycle = {phase: 'lowering', startedAt: now, components, wires: [], wireSet: new Set()};
        this.refreshStaticLayer();
    }

    private beginWireGrowth(now: number) {
        const lifecycle = this.lifecycle;
        if (!lifecycle) return;

        const random = this.createTransitionRandom();
        lifecycle.wires = lifecycle.components.flatMap((component) => this.connectAddedComponent(component, random));
        lifecycle.wireSet = new Set(lifecycle.wires);
        lifecycle.phase = 'growing';
        lifecycle.startedAt = now;
        this.refreshStaticLayer();
    }

    private completeLifecycle(now: number) {
        this.lifecycle = null;
        this.nextLifecycleAt = now + this.lifecycleInterval;
        this.refreshStaticLayer();
    }

    private connectAddedComponent(component: CircuitComponent, random: () => number) {
        const firstWire = this.wires.length;
        const neighbors = this.nearestComponents(component);

        if (component.kind === 'cpu') {
            for (const neighbor of neighbors) {
                if (this.connectBus(component, neighbor, random)) break;
            }
        }

        const targetConnections = component.kind === 'cpu' ? 4 : 3;
        for (let connection = 0; connection < targetConnections; connection += 1) {
            let connected = false;
            for (let offset = 0; offset < neighbors.length; offset += 1) {
                const neighbor = neighbors[(connection + offset) % neighbors.length];
                if (!this.hasFreeFacingPins(component, neighbor)) continue;
                if (!this.connectPins(component, neighbor, random)) continue;
                connected = true;
                break;
            }
            if (!connected) break;
        }
        return this.wires.slice(firstWire);
    }

    private lifecycleProgress(now: number) {
        if (!this.lifecycle) return 1;
        const duration = this.lifecycle.phase === 'lifting' || this.lifecycle.phase === 'lowering'
            ? this.componentTransitionDuration
            : this.wireTransitionDuration;
        return Math.min(1, Math.max(0, (now - this.lifecycle.startedAt) / duration));
    }

    private createTransitionRandom() {
        this.transitionSeed = (this.transitionSeed + 0x9E3779B9) >>> 0;
        return this.createRandom(this.transitionSeed);
    }

    private refreshStaticLayer() {
        if (!this.layout) return;
        this.renderStaticLayer(this.layout.width, this.layout.height, this.layout.pixelRatio, this.lifecycle);
    }

    private renderStaticLayer(
        width: number,
        height: number,
        pixelRatio: number,
        lifecycle: CircuitLifecycle | null = null,
    ) {
        const pixelWidth = Math.max(1, Math.floor(width * pixelRatio));
        const pixelHeight = Math.max(1, Math.floor(height * pixelRatio));
        const staticLayer = this.staticLayer
            && this.staticLayer.width === pixelWidth
            && this.staticLayer.height === pixelHeight
            ? this.staticLayer
            : typeof OffscreenCanvas === 'function'
                ? new OffscreenCanvas(pixelWidth, pixelHeight)
                : document.createElement('canvas');
        if (staticLayer.width !== pixelWidth) staticLayer.width = pixelWidth;
        if (staticLayer.height !== pixelHeight) staticLayer.height = pixelHeight;
        const context = staticLayer.getContext('2d');
        if (!context) {
            this.staticLayer = null;
            this._staticVersion += 1;
            return;
        }

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, pixelWidth, pixelHeight);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        this.drawStaticCircuit(context, width, height, 0, lifecycle);
        this.staticLayer = staticLayer;
        this._staticVersion += 1;
    }

    private drawStaticCircuit(
        context: CircuitRenderContext,
        width: number,
        height: number,
        now: number,
        lifecycle: CircuitLifecycle | null = null,
    ) {
        context.save();
        context.lineCap = 'round';
        context.lineJoin = 'round';
        this.drawDotGrid(context, width, height);
        const lifecycleWires = lifecycle?.wireSet;
        const lifecycleComponents = lifecycle && new Set(lifecycle.components);
        this.wires.forEach((wire) => {
            if (!lifecycleWires?.has(wire)) this.drawWire(context, wire);
        });
        this.components.forEach((component) => {
            if (!lifecycleComponents?.has(component)) this.drawComponent(context, component, now);
        });
        context.restore();
    }

    private drawWire(context: CircuitRenderContext, wire: CircuitWire) {
        context.lineWidth = wire.isBus ? 1.4 : 1;
        context.strokeStyle = wire.isBus ? 'rgba(102, 204, 245, 0.42)' : 'rgba(94, 183, 229, 0.3)';
        context.beginPath();
        context.moveTo(wire.points[0].x, wire.points[0].y);
        for (let index = 1; index < wire.points.length; index += 1) {
            context.lineTo(wire.points[index].x, wire.points[index].y);
        }
        context.stroke();
    }

    private drawLifecycle(context: CanvasRenderingContext2D, now: number) {
        const lifecycle = this.lifecycle;
        if (!lifecycle) return;

        const progress = this.lifecycleProgress(now);
        context.save();
        context.lineCap = 'round';
        context.lineJoin = 'round';
        if (lifecycle.phase === 'lifting') {
            lifecycle.wires.forEach((wire) => {
                this.drawWireRange(context, wire, 0, 1);
                this.drawPulseRange(context, wire, now, 0, 1);
            });
            lifecycle.components.forEach((component) =>
                this.drawTransitionComponent(context, component, now, progress, true),
            );
        } else if (lifecycle.phase === 'erasing') {
            lifecycle.wires.forEach((wire) => {
                const removedComponent = lifecycle.components.includes(wire.fromComponent)
                    ? wire.fromComponent
                    : wire.toComponent;
                const [start, end] = this.removalWireRange(wire, removedComponent, progress);
                this.drawWireRange(context, wire, start, end);
                this.drawPulseRange(context, wire, now, start, end);
            });
        } else if (lifecycle.phase === 'lowering') {
            lifecycle.components.forEach((component) =>
                this.drawTransitionComponent(context, component, now, progress, false),
            );
        } else {
            lifecycle.wires.forEach((wire) => {
                this.drawWireRange(context, wire, 0, progress);
                this.drawPulseRange(context, wire, now, 0, progress);
            });
            lifecycle.components.forEach((component) =>
                this.drawTransitionComponent(context, component, now, 1, false),
            );
        }
        context.restore();
    }

    private drawTransitionComponent(
        context: CanvasRenderingContext2D,
        component: CircuitComponent,
        now: number,
        progress: number,
        isRemoving: boolean,
    ) {
        const visibility = isRemoving ? 1 - progress : progress;
        const lift = this.gridSize * 1.6 * (isRemoving ? progress : 1 - progress);
        context.save();
        context.globalAlpha = visibility;
        context.translate(-lift * 0.8, -lift);
        this.drawComponent(context, component, now);
        context.restore();
    }

    private removalWireRange(wire: CircuitWire, component: CircuitComponent, progress: number): [number, number] {
        return wire.fromComponent === component ? [progress, 1] : [0, 1 - progress];
    }

    private drawWireRange(
        context: CanvasRenderingContext2D,
        wire: CircuitWire,
        startProgress: number,
        endProgress: number,
    ) {
        if (endProgress <= startProgress || !wire.totalLength) return;

        const startDistance = wire.totalLength * startProgress;
        const endDistance = wire.totalLength * endProgress;
        let distance = 0;
        context.lineWidth = wire.isBus ? 1.4 : 1;
        context.strokeStyle = wire.isBus ? 'rgba(102, 204, 245, 0.42)' : 'rgba(94, 183, 229, 0.3)';
        context.beginPath();
        const start = this.pointAlong(wire, startProgress);
        context.moveTo(start.x, start.y);

        wire.segmentLengths.forEach((length, index) => {
            distance += length;
            if (distance > startDistance && distance < endDistance) {
                const point = wire.points[index + 1];
                context.lineTo(point.x, point.y);
            }
        });
        const end = this.pointAlong(wire, endProgress);
        context.lineTo(end.x, end.y);
        context.stroke();
    }

    private drawPulse(context: CanvasRenderingContext2D, wire: CircuitWire, now: number) {
        this.drawPulseRange(context, wire, now, 0, 1);
    }

    private drawPulseRange(
        context: CanvasRenderingContext2D,
        wire: CircuitWire,
        now: number,
        startProgress: number,
        endProgress: number,
    ) {
        const progress = (now * (wire.isBus ? 0.00012 : 0.00016) + wire.phase) % 1;
        if (progress < startProgress || progress > endProgress) return;
        const pulse = this.pointAlong(wire, progress);
        context.fillStyle = wire.isBus ? 'rgba(206, 246, 255, 0.95)' : 'rgba(184, 230, 255, 0.82)';
        context.beginPath();
        context.arc(pulse.x, pulse.y, wire.isBus ? 2.35 : 2, 0, Math.PI * 2);
        context.fill();
    }

    private drawDotGrid(context: CircuitRenderContext, width: number, height: number) {
        context.fillStyle = 'rgba(96, 181, 208, 0.3)';
        for (let y = 0; y <= height; y += this.gridSize) {
            for (let x = 0; x <= width; x += this.gridSize) {
                context.fillRect(x - 1, y - 1, 2, 2);
            }
        }
    }

    private pinOffset(length: number, index: number, count: number) {
        const units = Math.round(length / this.gridSize);
        const first = Math.max(1, Math.floor((units - (count - 1)) / 2));
        return Math.min(units - 1, first + index) * this.gridSize;
    }

    private randomGridCoordinate(minimum: number, maximum: number, random: () => number) {
        const first = Math.ceil(minimum / this.gridSize);
        const last = Math.floor(maximum / this.gridSize);
        if (last < first) return this.snapToGrid((minimum + maximum) / 2);
        return (first + Math.floor(random() * (last - first + 1))) * this.gridSize;
    }

    private snapToGrid(value: number) {
        return Math.round(value / this.gridSize) * this.gridSize;
    }

    private sideDirection(side: PinSide): CircuitPoint {
        return {top: {x: 0, y: -1}, right: {x: 1, y: 0}, bottom: {x: 0, y: 1}, left: {x: -1, y: 0}}[side];
    }

    private pointAlong(wire: CircuitWire, progress: number): CircuitPoint {
        let distance = wire.totalLength * progress;
        for (let index = 0; index < wire.segmentLengths.length; index += 1) {
            if (distance > wire.segmentLengths[index]) {
                distance -= wire.segmentLengths[index];
                continue;
            }
            const start = wire.points[index];
            const end = wire.points[index + 1];
            const ratio = wire.segmentLengths[index] ? distance / wire.segmentLengths[index] : 0;
            return {x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio};
        }
        return wire.points[wire.points.length - 1];
    }

    private drawComponent(context: CircuitRenderContext, component: CircuitComponent, now: number) {
        const pulse = 0.48 + Math.sin(now * 0.0016 + component.x) * 0.08;
        context.fillStyle = 'rgba(5, 22, 29, 0.9)';
        context.fillRect(component.x, component.y, component.width, component.height);
        context.strokeStyle = `rgba(141, 216, 243, ${pulse})`;
        context.lineWidth = 1.15;
        context.strokeRect(component.x, component.y, component.width, component.height);

        component.pins.forEach((pin) => {
            const direction = this.sideDirection(pin.side);
            context.strokeStyle = pin.used ? 'rgba(188, 238, 255, 0.88)' : 'rgba(119, 189, 217, 0.48)';
            context.lineWidth = 1.3;
            context.beginPath();
            context.moveTo(pin.x, pin.y);
            context.lineTo(pin.x - direction.x * 6, pin.y - direction.y * 6);
            context.stroke();
            context.fillStyle = pin.used ? 'rgba(213, 246, 255, 0.9)' : 'rgba(132, 201, 226, 0.56)';
            context.fillRect(pin.x - 1.5, pin.y - 1.5, 3, 3);
        });

        context.fillStyle = 'rgba(160, 225, 244, 0.62)';
        if (component.kind === 'cpu') {
            context.fillRect(component.x + component.width / 2 - 7, component.y - 1, 14, 3);
            this.drawCpuMarker(context, component);
            context.fillStyle = 'rgba(160, 225, 244, 0.62)';
            context.font = '600 10px ui-monospace, SFMono-Regular, Consolas, monospace';
            context.textAlign = 'center';
            context.fillText(component.label, component.x + component.width / 2, component.y + component.height / 2 + 3.5);
        } else {
            context.beginPath();
            context.arc(component.x + component.width / 2, component.y + 3, 4, 0, Math.PI);
            context.fill();
            context.font = '500 6px ui-monospace, SFMono-Regular, Consolas, monospace';
            context.textAlign = 'center';
            context.fillText(component.label, component.x + component.width / 2, component.y + component.height / 2 + 2);
        }
    }

    private drawCpuMarker(context: CircuitRenderContext, component: CircuitComponent) {
        const inset = 7;
        const size = 7;
        const left = component.x + inset;
        const right = component.x + component.width - inset;
        const top = component.y + inset;
        const bottom = component.y + component.height - inset;
        context.fillStyle = 'rgba(248, 192, 65, 0.95)';
        context.beginPath();

        switch (component.markerCorner) {
            case 'top-right':
                context.moveTo(right, top);
                context.lineTo(right - size, top);
                context.lineTo(right, top + size);
                break;
            case 'bottom-right':
                context.moveTo(right, bottom);
                context.lineTo(right, bottom - size);
                context.lineTo(right - size, bottom);
                break;
            case 'bottom-left':
                context.moveTo(left, bottom);
                context.lineTo(left + size, bottom);
                context.lineTo(left, bottom - size);
                break;
            default:
                context.moveTo(left, top);
                context.lineTo(left, top + size);
                context.lineTo(left + size, top);
        }
        context.closePath();
        context.fill();
    }

    private createRandom(seed: number) {
        let value = seed >>> 0;
        return () => {
            value += 0x6D2B79F5;
            let result = value;
            result = Math.imul(result ^ result >>> 15, result | 1);
            result ^= result + Math.imul(result ^ result >>> 7, result | 61);
            return ((result ^ result >>> 14) >>> 0) / 4_294_967_296;
        };
    }
}