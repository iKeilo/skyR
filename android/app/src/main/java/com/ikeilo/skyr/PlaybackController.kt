package com.ikeilo.skyr

import android.graphics.PointF
import android.os.Handler
import android.os.Looper
import kotlin.math.roundToLong

object PlaybackController {
    interface Listener {
        fun onStateChanged(state: String)
        fun onPlaybackFinished()
        fun onPlaybackStarted()
    }

    private val main = Handler(Looper.getMainLooper())

    @Volatile private var worker: Thread? = null
    @Volatile private var paused = false
    @Volatile private var stopped = true

    var listener: Listener? = null
    var song: Song? = null
    var keyPoints: List<PointF> = emptyList()
    var speed: Double = 1.0

    val isPlaying: Boolean
        get() = worker?.isAlive == true && !paused

    val isPaused: Boolean
        get() = worker?.isAlive == true && paused

    fun start() {
        val currentSong = song ?: return notify("请先选择乐谱")
        if (keyPoints.size != 15) return notify("请先定位琴键")
        val service = SkyAccessibilityService.activeService ?: return notify("无障碍服务未启动")
        if (worker?.isAlive == true) return

        stopped = false
        paused = false
        main.post {
            listener?.onPlaybackStarted()
            listener?.onStateChanged("开始演奏: ${currentSong.name}")
        }

        worker = Thread {
            try {
                for (event in currentSong.events) {
                    if (stopped) break
                    waitIfPaused()
                    if (event.delayMs > 0L) {
                        sleepScaled(event.delayMs)
                    }
                    if (event.keys.isNotEmpty()) {
                        val points = event.keys.mapNotNull { keyPoints.getOrNull(it) }
                        if (!service.tap(points)) {
                            notify("手势派发失败")
                        }
                    }
                }
            } finally {
                stopped = true
                paused = false
                main.post {
                    listener?.onPlaybackFinished()
                    listener?.onStateChanged("演奏结束")
                }
            }
        }.apply {
            name = "SkyRPlayback"
            start()
        }
    }

    fun pauseOrResume() {
        if (worker?.isAlive != true) return
        paused = !paused
        notify(if (paused) "已暂停" else "继续演奏")
    }

    fun stop() {
        stopped = true
        paused = false
        worker?.interrupt()
        worker = null
        notify("已停止")
    }

    private fun waitIfPaused() {
        while (paused && !stopped) {
            Thread.sleep(50L)
        }
    }

    private fun sleepScaled(delayMs: Long) {
        var remaining = (delayMs * (1.0 / speed)).roundToLong().coerceAtLeast(0L)
        while (remaining > 0L && !stopped) {
            waitIfPaused()
            val chunk = minOf(remaining, 40L)
            Thread.sleep(chunk)
            remaining -= chunk
        }
    }

    private fun notify(message: String) {
        main.post { listener?.onStateChanged(message) }
    }
}
