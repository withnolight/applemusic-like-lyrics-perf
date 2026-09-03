import { describe, expect, it } from "vitest";
import { LayoutAlignAnchor } from "#lyric/base/consts.ts";
import {
	LayoutCalculator,
	type LayoutConfig,
	type LayoutFrameContext,
} from "#lyric/base/layout.ts";

const CONFIG: LayoutConfig = {
	alignAnchor: LayoutAlignAnchor.Center,
	alignPosition: 0.5,
	overscanPx: 0,
};

function createContext(): LayoutFrameContext {
	return {
		containerHeight: 100,
		scrollOffset: 0,
		target: { type: "line", index: 50 },
		bottomLineHeight: 20,
	};
}

describe("LayoutCalculator active window", () => {
	it("returns only lines intersecting the overscan and motion window", () => {
		const calculator = new LayoutCalculator();
		calculator.initHeights(100, 20);
		const context = createContext();
		const { session } = calculator.beginFrame(context, CONFIG);

		const result = calculator.commit(session, 0);

		expect(result.lineStart).toBe(45);
		expect(result.lineEnd).toBe(56);
		expect(result.lineCount).toBe(11);
		expect(result.lineInstructions[45]).toMatchObject({
			y: -60,
			height: 20,
			isInViewport: true,
		});
		expect(result.lineInstructions[55]).toMatchObject({
			y: 140,
			height: 20,
			isInViewport: true,
		});
	});

	it("keeps binary window bounds correct across an interlude gap", () => {
		const calculator = new LayoutCalculator();
		calculator.initHeights(100, 20);
		const context = createContext();
		context.interlude = { anchorIndex: 49, totalHeight: 60 };
		const { session } = calculator.beginFrame(context, CONFIG);

		const result = calculator.commit(session, 0);

		expect(result.lineStart).toBe(48);
		expect(result.lineEnd).toBe(56);
		expect(result.lineCount).toBe(8);
		expect(result.interludeY).toBe(-20);
		expect(result.lineInstructions[49].y).toBe(-40);
		expect(result.lineInstructions[50].y).toBe(40);
	});

	it("returns an empty window when all lyrics are outside the update bounds", () => {
		const calculator = new LayoutCalculator();
		calculator.initHeights(4, 20);
		const context: LayoutFrameContext = {
			...createContext(),
			target: { type: "line", index: 0 },
		};
		const { session } = calculator.beginFrame(context, CONFIG);

		const result = calculator.commit(session, 1_000);

		expect(result.lineStart).toBe(4);
		expect(result.lineEnd).toBe(4);
		expect(result.lineCount).toBe(0);
	});
});
