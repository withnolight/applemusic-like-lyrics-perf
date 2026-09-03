import type { Disposable } from "#interfaces";
import { Spring } from "#utils/spring.ts";
import { Duration, MediaTime } from "#utils/time.ts";
import { LyricLineRenderMode } from "./consts.ts";
import type { LyricLineBase } from "./line.ts";

export interface LyricPlayerFlags {
	getEnableSpring(): boolean;
	getEnableScale(): boolean;
	getIsPlaying(): boolean;
	getAlwaysPostpositionBackground(): boolean;
}

export abstract class LyricLineGroupBase<
	T extends LyricLineBase = LyricLineBase,
> implements Disposable
{
	protected abstract readonly lyricPlayer: LyricPlayerFlags;

	/**
	 * 歌词组在播放器排序后的稳定索引。
	 *
	 * 由播放器重建视图时写入，供逐帧布局和可见性判断直接读取，
	 * 避免在热路径中反复扫描 `currentLyricGroups`。
	 * @internal
	 */
	public groupIndex = -1;
	/** 当前组是否处于布局计算器产出的活动窗口内 */
	public isInLayoutWindow = false;

	public posY: Spring = new Spring(0);
	public bgSlideY: Spring = new Spring(-80);
	public top = 0;
	public delay: Duration = Duration.ZERO;

	public isActive = false;
	public opacity = 1;
	public blur = 0;

	public isBgFirst = false;

	protected isUiDirty = true;

	constructor(
		public mainLine: T,
		public bgLine?: T | undefined,
	) {}

	get startTime(): MediaTime {
		// 优化歌词时 `syncMainAndBackgroundLines` 已经把时间同步好了，直接读取主歌词的即可
		// 要是用户关掉了这个优化，我们认为在这种情况下主歌词和背景人声显示不同步是符合用户预期的
		return MediaTime.fromMillis(this.mainLine.getLine().startTime);
	}

	get endTime(): MediaTime {
		return MediaTime.fromMillis(this.mainLine.getLine().endTime);
	}

	onLineSizeChange(size: [number, number]): void {
		this.mainLine.onLineSizeChange(size);
		this.bgLine?.onLineSizeChange(size);
	}

	onBgSizeChange?(size: [number, number]): void;

	abstract getElement(): Element;

	setTransform(
		top: number,
		immediate: boolean,
		delay: Duration,
		isActive: boolean,
		opacity: number,
		blur: number,
		immediateLineTransform = false,
	): void {
		this.top = top;
		this.delay = delay;
		this.isActive = isActive;
		this.opacity = opacity;
		this.blur = blur;

		this.setLineTransformations(delay, immediateLineTransform);

		const enableSpring = this.lyricPlayer.getEnableSpring();
		const alwaysPostposition =
			this.lyricPlayer.getAlwaysPostpositionBackground();
		const shouldBgFirst = alwaysPostposition ? false : this.isBgFirst;
		const hiddenSlideY = shouldBgFirst ? 80 : -80;

		const isPlaying = this.lyricPlayer.getIsPlaying();
		const targetBgSlideY = isActive || !isPlaying ? 0 : hiddenSlideY;

		if (immediate || !enableSpring) {
			this.posY.setPosition(top);
			this.bgSlideY.setPosition(targetBgSlideY);
		} else {
			this.posY.setTargetPosition(top, delay);
			this.bgSlideY.setTargetPosition(targetBgSlideY, delay);
		}

		this.isUiDirty = true;
	}

	private setLineTransformations(delay: Duration, immediate: boolean) {
		const enableScale = this.lyricPlayer.getEnableScale();
		const isPlaying = this.lyricPlayer.getIsPlaying();

		const renderMode = this.isActive
			? LyricLineRenderMode.GRADIENT
			: LyricLineRenderMode.SOLID;

		const SCALE_ASPECT = enableScale ? 97 : 100;
		let mainScale = 100;
		if (!this.isActive && isPlaying) {
			mainScale = SCALE_ASPECT;
		}

		this.mainLine.setTransform(mainScale, 1, 0, delay, renderMode, immediate);

		let bgScale = 100;
		if (!this.isActive && isPlaying) {
			bgScale = 75;
		}
		this.bgLine?.setTransform(bgScale, 1, 0, delay, renderMode, immediate);
	}

	protected abstract renderStyles(): void;

	abstract get isInSight(): boolean;

	update(delta: Duration = Duration.ZERO): void {
		if (this.lyricPlayer.getEnableSpring()) {
			const posMoving = !this.posY.arrived();
			const bgMoving = !this.bgSlideY.arrived();
			this.posY.update(delta);
			this.bgSlideY.update(delta);

			if (posMoving || bgMoving) {
				this.isUiDirty = true;
			}
		}

		this.mainLine.update(delta);
		this.bgLine?.update(delta);
	}

	/** 当前组是否仍有需要逐帧推进的弹簧动画 */
	getNeedsUpdate(): boolean {
		return (
			this.lyricPlayer.getEnableSpring() &&
			(!this.posY.arrived() ||
				!this.bgSlideY.arrived() ||
				this.mainLine.getNeedsUpdate() ||
				(this.bgLine?.getNeedsUpdate() ?? false))
		);
	}

	/** 进入活动布局窗口 */
	enterLayoutWindow(): void {
		this.isInLayoutWindow = true;
	}

	/**
	 * 离开活动布局窗口，并将所有逐帧动画推进到终态。
	 * DOM 实现可覆盖此方法以同步卸载元素。
	 */
	leaveLayoutWindow(): void {
		this.isInLayoutWindow = false;
		this.posY.finish();
		this.bgSlideY.finish();
		this.mainLine.finishAnimations();
		this.bgLine?.finishAnimations();
		this.isUiDirty = true;
	}

	commitChanges(): void {
		if (!this.isInSight) return;
		if (this.isUiDirty) {
			this.renderStyles();
			this.isUiDirty = false;
		}
		this.mainLine.commitChanges();
		this.bgLine?.commitChanges();
	}

	rebuildAllLines(): void {
		this.mainLine.rebuildElement();
		this.bgLine?.rebuildElement();
	}

	enable(time?: number, shouldPlay?: boolean): void {
		this.mainLine.enable(time, shouldPlay);
		this.bgLine?.enable(time, shouldPlay);
	}

	disable(): void {
		this.mainLine.disable();
		this.bgLine?.disable();
	}

	dispose(): void {
		this.mainLine.dispose();
		this.bgLine?.dispose();
	}
}
