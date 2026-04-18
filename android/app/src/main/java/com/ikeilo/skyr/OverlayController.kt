package com.ikeilo.skyr

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.PointF
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlin.math.roundToInt

@SuppressLint("SetTextI18n")
class OverlayController(private val context: Context) : PlaybackController.Listener {
    private val windowManager = context.getSystemService(WindowManager::class.java)
    private val positionStore = PositionStore(context)
    private var controls: View? = null
    private var positionView: View? = null
    private var controlsParams: WindowManager.LayoutParams? = null
    private var positionParams: WindowManager.LayoutParams? = null
    private var pauseButton: Button? = null
    private var positionButton: Button? = null
    private val speeds = listOf(0.4, 0.6, 0.8, 1.0, 1.5, 2.0)
    private var speedIndex = 3

    init {
        PlaybackController.listener = this
        positionStore.load()?.let { PlaybackController.keyPoints = it.points }
    }

    fun showControls() {
        if (!Settings.canDrawOverlays(context)) {
            Toast.makeText(context, "请先授予悬浮窗权限", Toast.LENGTH_SHORT).show()
            return
        }
        if (controls != null) return

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.argb(210, 0, 0, 0))
            setPadding(10, 10, 10, 10)
        }
        val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        val play = button("开始") { PlaybackController.start() }
        pauseButton = button("暂停") { PlaybackController.pauseOrResume() }.apply {
            visibility = View.GONE
        }
        val speed = button("1x") {
            speedIndex = (speedIndex + 1) % speeds.size
            PlaybackController.speed = speeds[speedIndex]
            (it as Button).text = "${PlaybackController.speed}x"
        }
        positionButton = button("定位") {
            if (positionView == null) showPositionOverlay() else finishPosition()
        }
        val exit = button("退出") {
            PlaybackController.stop()
            removePositionOverlay()
            removeControls()
        }
        listOf(play, pauseButton, speed, positionButton, exit).forEach { row.addView(it) }
        root.addView(row)
        makeDraggable(root) { controlsParams }

        val params = baseParams().apply {
            width = WindowManager.LayoutParams.WRAP_CONTENT
            height = WindowManager.LayoutParams.WRAP_CONTENT
            x = 20
            y = 80
        }
        controlsParams = params
        windowManager.addView(root, params)
        controls = root
    }

    private fun showPositionOverlay() {
        if (positionView != null) return
        val metrics = context.resources.displayMetrics
        val width = (metrics.widthPixels * 0.95f).roundToInt()
        val height = (metrics.heightPixels * 0.95f).roundToInt()
        val x = ((metrics.widthPixels - width) / 2f).roundToInt()
        val y = ((metrics.heightPixels - height) / 2f).roundToInt()

        val root = FrameLayout(context).apply {
            setBackgroundColor(Color.argb(70, 255, 204, 0))
        }
        val grid = GridLayout(context).apply {
            rowCount = 3
            columnCount = 5
        }
        repeat(15) {
            val cell = TextView(context).apply {
                setBackgroundColor(Color.argb(40, 255, 255, 255))
            }
            grid.addView(cell, GridLayout.LayoutParams().apply {
                columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                rowSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                setGravity(Gravity.FILL)
                setMargins(4, 4, 4, 4)
            })
        }
        val label = TextView(context).apply {
            text = "覆盖全部琴键区域"
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            textSize = 18f
        }
        val handle = TextView(context).apply {
            text = "resize"
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setBackgroundColor(Color.argb(150, 0, 0, 0))
        }
        root.addView(grid, FrameLayout.LayoutParams(-1, -1).apply { setMargins(10, 10, 10, 10) })
        root.addView(label, FrameLayout.LayoutParams(-1, -1))
        root.addView(handle, FrameLayout.LayoutParams(dp(84), dp(44), Gravity.BOTTOM or Gravity.END))
        makePositionAdjustable(root)

        val params = baseParams().apply {
            this.width = width
            this.height = height
            this.x = x
            this.y = y
        }
        positionParams = params
        windowManager.addView(root, params)
        positionView = root
        positionButton?.text = "定位好了"
    }

    private fun finishPosition() {
        val params = positionParams ?: return
        val cellW = params.width / 5f
        val cellH = params.height / 3f
        val points = mutableListOf<PointF>()
        for (row in 0 until 3) {
            for (col in 0 until 5) {
                points += PointF(params.x + cellW * (col + 0.5f), params.y + cellH * (row + 0.5f))
            }
        }
        val config = PositionConfig(points)
        PlaybackController.keyPoints = points
        positionStore.save(config)
        Toast.makeText(context, "定位已保存", Toast.LENGTH_SHORT).show()
        removePositionOverlay()
    }

    private fun removePositionOverlay() {
        positionView?.let { windowManager.removeView(it) }
        positionView = null
        positionParams = null
        positionButton?.text = "定位"
    }

    private fun removeControls() {
        controls?.let { windowManager.removeView(it) }
        controls = null
        controlsParams = null
    }

    override fun onStateChanged(state: String) {
        Toast.makeText(context, state, Toast.LENGTH_SHORT).show()
    }

    override fun onPlaybackStarted() {
        pauseButton?.visibility = View.VISIBLE
        pauseButton?.text = "暂停"
    }

    override fun onPlaybackFinished() {
        pauseButton?.visibility = View.GONE
    }

    private fun button(text: String, action: (View) -> Unit): Button {
        return Button(context).apply {
            this.text = text
            minWidth = dp(64)
            setOnClickListener(action)
        }
    }

    private fun baseParams(): WindowManager.LayoutParams {
        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            android.graphics.PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
        }
    }

    private fun makeDraggable(view: View, paramsProvider: () -> WindowManager.LayoutParams?) {
        var startX = 0
        var startY = 0
        var touchX = 0f
        var touchY = 0f
        view.setOnTouchListener { _, event ->
            val params = paramsProvider() ?: return@setOnTouchListener false
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = params.x
                    startY = params.y
                    touchX = event.rawX
                    touchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = startX + (event.rawX - touchX).roundToInt()
                    params.y = startY + (event.rawY - touchY).roundToInt()
                    windowManager.updateViewLayout(view, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    view.performClick()
                    true
                }
                else -> false
            }
        }
    }

    private fun makePositionAdjustable(view: View) {
        var startX = 0
        var startY = 0
        var startW = 0
        var startH = 0
        var touchX = 0f
        var touchY = 0f
        var resizing = false
        view.setOnTouchListener { _, event ->
            val params = positionParams ?: return@setOnTouchListener false
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = params.x
                    startY = params.y
                    startW = params.width
                    startH = params.height
                    touchX = event.rawX
                    touchY = event.rawY
                    resizing = event.x > view.width - dp(96) && event.y > view.height - dp(64)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchX).roundToInt()
                    val dy = (event.rawY - touchY).roundToInt()
                    if (resizing) {
                        params.width = (startW + dx).coerceAtLeast(dp(220))
                        params.height = (startH + dy).coerceAtLeast(dp(140))
                    } else {
                        params.x = startX + dx
                        params.y = startY + dy
                    }
                    windowManager.updateViewLayout(view, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    view.performClick()
                    true
                }
                else -> false
            }
        }
    }

    private fun dp(value: Int): Int {
        return (value * context.resources.displayMetrics.density).roundToInt()
    }
}
