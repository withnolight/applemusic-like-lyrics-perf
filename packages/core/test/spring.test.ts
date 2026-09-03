import { describe, expect, it } from "vitest";
import { Spring } from "#utils/spring.ts";
import { Duration } from "#utils/time.ts";

describe("Spring.finish", () => {
	it("snaps to a delayed target and clears pending animation work", () => {
		const spring = new Spring(0);
		spring.setTargetPosition(100, Duration.fromMillis(200));

		expect(spring.arrived()).toBe(false);
		spring.finish();

		expect(spring.getCurrentPosition()).toBe(100);
		expect(spring.arrived()).toBe(true);
	});
});
