# 歌词渲染性能基准

运行：

```bash
pnpm --filter @applemusic-like-lyrics/core perf
```

`lyric-render.perf.ts` 在同一进程中并列运行补丁前的对照算法和当前实现：

- P0 #1：每组调用 `indexOf`，对比缓存的 `groupIndex`。
- P0 #2：10 秒空闲期间持续续订 RAF，对比只在首次状态变化时唤醒一帧。
- P0 #3：全量计算 100,000 行，对比前缀和上的二分活动窗口。

基准中的 `before` 实现是从补丁前热路径抽取的等价模型，不会切换工作区分支；因此源码和结果可以在一次运行中直接比较。
