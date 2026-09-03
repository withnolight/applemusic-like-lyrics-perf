import { bench, describe, expect, it } from "vitest";
import { LayoutAlignAnchor } from "#lyric/base/consts.ts";
import {
	LayoutCalculator,
	type LayoutConfig,
	type LayoutFrameContext,
} from "#lyric/base/layout.ts";

/**
 * 这些基准把补丁前的热路径保留为对照实现，和当前实现放在同一个进程中运行。
 * 这样可以比较算法差异，而不是比较两次不同机器/不同负载下的绝对耗时。
 */

const GROUP_COUNT = 8_000;
const LAYOUT_LINE_COUNT = 100_000;
const IDLE_FRAME_COUNT = 600; // 10 秒 @ 60 FPS

const groupHeights = new Float64Array(GROUP_COUNT);
const groupPositions = new Float64Array(GROUP_COUNT);
const groups = Array.from({ length: GROUP_COUNT }, (_, groupIndex) => {
	groupHeights[groupIndex] = 20 + (groupIndex % 5);
	groupPositions[groupIndex] = (groupIndex % 700) - 350;
	return { groupIndex };
});

const indexedSightPass = (): number => {
	let visibleCount = 0;
	for (const group of groups) {
		const index = group.groupIndex;
		const top = groupPositions[index];
		const height = groupHeights[index];
		if (!(top > 500 + height + 300 || top < -height - 300)) {
			visibleCount++;
		}
	}
	return visibleCount;
};

const indexOfSightPass = (): number => {
	let visibleCount = 0;
	for (const group of groups) {
		const index = groups.indexOf(group);
		const top = groupPositions[index];
		const height = groupHeights[index];
		if (!(top > 500 + height + 300 || top < -height - 300)) {
			visibleCount++;
		}
	}
	return visibleCount;
};

describe("P0 #1: cached lyric group index", () => {
	bench("before: indexOf for every group", () => {
		return indexOfSightPass();
	});

	bench("after: cached groupIndex", () => {
		return indexedSightPass();
	});

	it("keeps the same visibility result", () => {
		expect(indexedSightPass()).toBe(indexOfSightPass());
	});
});

const layoutConfig: LayoutConfig = {
	alignAnchor: LayoutAlignAnchor.Center,
	alignPosition: 0.35,
	overscanPx: 300,
};

const layoutContext: LayoutFrameContext = {
	containerHeight: 720,
	scrollOffset: 0,
	target: { type: "line", index: LAYOUT_LINE_COUNT / 2 },
	bottomLineHeight: 40,
};

const layoutCalculator = new LayoutCalculator();
layoutCalculator.initHeights(LAYOUT_LINE_COUNT, 24);
const layoutFrame = layoutCalculator.beginFrame(layoutContext, layoutConfig);
// 预热前缀和构建，避免把一次性初始化成本混入逐帧 commit 基准。
layoutCalculator.commit(layoutFrame.session, 0);

const layoutPrefixSums = new Float64Array(LAYOUT_LINE_COUNT + 1);
for (let i = 0; i < LAYOUT_LINE_COUNT; i++) {
	layoutPrefixSums[i + 1] = layoutPrefixSums[i] + 24;
}
const legacyInstructions = Array.from({ length: LAYOUT_LINE_COUNT }, () => ({
	y: 0,
	height: 0,
	isInViewport: false,
}));

const legacyLayoutCommit = (): number => {
	const { session } = layoutFrame;
	const viewportStartY =
		session.containerHeight * session.alignPosition -
		session.anchorOffset -
		session.focalTopY;
	const viewportTopBound = -session.overscanPx - session.containerHeight * 0.4;
	const viewportBottomBound =
		session.containerHeight +
		session.overscanPx +
		session.containerHeight * 0.4;
	let visibleCount = 0;

	for (let i = 0; i < LAYOUT_LINE_COUNT; i++) {
		const lineY = viewportStartY + layoutPrefixSums[i];
		const lineHeight = layoutPrefixSums[i + 1] - layoutPrefixSums[i];
		const isInViewport =
			lineY <= viewportBottomBound && lineY + lineHeight >= viewportTopBound;
		legacyInstructions[i].y = lineY;
		legacyInstructions[i].height = lineHeight;
		legacyInstructions[i].isInViewport = isInViewport;
		if (isInViewport) {
			visibleCount++;
		}
	}
	return visibleCount;
};

const activeWindowCommit = (): number =>
	layoutCalculator.commit(layoutFrame.session, 0).lineCount;

describe("P0 #3: active layout window", () => {
	bench("before: calculate every lyric line", () => {
		return legacyLayoutCommit();
	});

	bench("after: binary-search and calculate active window", () => {
		return activeWindowCommit();
	});

	it("visits a small active window for a long song", () => {
		expect(activeWindowCommit()).toBeLessThan(LAYOUT_LINE_COUNT / 100);
	});
});

type IdleSimulation = {
	callbackCount: number;
	work: number;
};

const legacyIdleFrameCount = (): IdleSimulation => {
	let callbackCount = 0;
	let work = 0;
	for (let frame = 0; frame < IDLE_FRAME_COUNT; frame++) {
		callbackCount++;
		work = idleFrameWork(work);
	}
	return { callbackCount, work };
};

const demandDrivenIdleFrameCount = (): IdleSimulation => {
	// 首次布局变化唤醒一帧，动画已稳定后不再续订 RAF。
	return { callbackCount: 1, work: idleFrameWork(0) };
};

/** 代表一次已经进入 update 的少量固定工作，避免 RAF 基准只测循环控制开销。 */
function idleFrameWork(seed: number): number {
	let work = seed;
	for (let i = 0; i < 1_024; i++) {
		work = work * 1.0001 + i;
	}
	return work;
}

describe("P0 #2: idle RAF scheduling", () => {
	bench("before: perpetual RAF for 10 seconds", () => {
		return legacyIdleFrameCount().work;
	});

	bench("after: one wake-up frame after settling", () => {
		return demandDrivenIdleFrameCount().work;
	});

	it("does not schedule idle frames after settling", () => {
		expect(demandDrivenIdleFrameCount().callbackCount).toBe(1);
		expect(legacyIdleFrameCount().callbackCount).toBe(IDLE_FRAME_COUNT);
	});
});
