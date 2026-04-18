var pos; // 坐标系
var f_pos;  // 定位悬浮窗对象
var f_btn;  // 按钮悬浮窗对象
var f_select; // 乐谱选择

var isPlay = false;  // 是否可以弹奏乐谱
var playing = false;  // 是否正在弹奏乐谱
var musicDir = '/sdcard/skyMusicAuto/'; // 乐谱文件存放目录
var musicList = []; // 乐谱列表
var musicName; // 乐谱名字
var musicIndex = -1; // 选择的乐谱下标
var musicJSON; // 读取到的乐谱内容（object）
var musicNotes; // 解析完成的乐谱内容
var keyIndex = 0;  // 当前弹奏到的key下标

var speed_list = [0.2, 0.4, 0.6, 0.8, 1, 1.5, 1.8, 2]; // 弹奏速度
var speed = 1;  // 弹奏速度

var x = 300;  // 弹奏框x坐标
var y = 120;  // 弹奏框y坐标
var playW = 1061;  // 弹奏框宽度
var playH = 616;  // 弹奏框高度
var keySize = 171;  // 按键大小
var spanSize = 51.5; // 按键间隔
var posExt = 70;  // 悬浮窗定位需要额外减去的宽度和高度

var eventSub;

var storage;  // 本地存储对象
var storage_name = 'liang_2uv@qq.com:SKY';  // 本地存储的名字
var storage_key = 'POSITION';  // 存储位置信息的key

importClass(android.view.WindowManager);
importClass(android.view.inputmethod.EditorInfo);

/**
 * @method 自执行函数（主函数入口）
 */
(function() {
  tip('请开启【无障碍】【悬浮窗】权限', 'alert');
  posInit();
  musicItems(); // 1. 获取乐谱列表
  if (!this.musicList.length) { return; }
  storage = storages.create(storage_name);
  if (storage.contains(storage_key)) {  // 自定义过按键坐标
    const obj = storage.get(storage_key);
    pos = obj.pos;
    x = obj.x;
    y = obj.y;
    playW = obj.playW;
    playH = obj.playH;
    keySize = obj.keySize;
    spanSize = obj.spanSize;
    log(JSON.stringify(obj))
    tip('初始化按键坐标完毕');
  }
  eventListen();
  f_tbnOpen();
  f_posOpen();
  f_selectOpen();
  while(true) {}
})();

function posInit() {
  x = px2px(x);
  y = px2px(y);
  playW = px2px(playW);
  playH = px2px(playH);
  keySize = px2px(keySize);
  spanSize = px2px(spanSize);
  posExt = px2px(posExt);
}

function eventListen() {
  if (!eventSub) {
    eventSub = events.emitter();
    eventSub.on('musicSelect', function() {
      if (!pos) { tip('请先定位按键坐标'); return; }
      musicSelect();  // 2. 选择/读取乐谱
    });
    eventSub.on('musicParse', function() {
      musicParse(); // 3. 解析乐谱完毕
    });
    eventSub.on('playing', function() {
      if (isPlay) {
        dialogs.confirm('提示', '即将练习《' + musicName + '》', (ret) => {
          if (ret) {
            keyIndex = 0;
            playing = true;
            f_btn.btn_play_pause.setVisibility(0);
            f_btn.btn_play_pause.setText('暂停弹奏');
            play();
          }
        });
      }
    });
    eventSub.on('pause', function() { // 暂停或继续弹奏
      if (f_btn.btn_play_pause.getText() == '暂停弹奏') {  // 暂停
        playing = false;
        threads.shutDownAll();
        f_btn.btn_play_pause.setText('继续弹奏');
      } else {  // 继续
        playing = true;
        f_btn.btn_play_pause.setText('暂停弹奏');
        play();
      }
    });
    eventSub.on('speedOpen', function() {
      let ci = speed_list.findIndex(v => v === speed);
      dialogs.singleChoice('请选择弹奏速度', speed_list, ci, (i) => {
        if (i >= 0) {
          speed = speed_list[i];
          f_btn.btn_speed.setText('倍速' + speed + 'x');
          if (isPlay && !playing && keyIndex >= 0) {
            eventSub.emit('pause');
          }
        }
      });
    });
    eventSub.on('posOpen', function() {
      playing = false;
      threads.shutDownAll();
      musicIndex = -1;
      musicNotes = [];
      f_btn.btn_position.setText('定位好了');
      f_btn.btn_play_start.setVisibility(8);
      f_btn.btn_speed.setVisibility(8);
      f_btn.btn_play_pause.setVisibility(8);
      resetPosWindow();
      f_pos.board.setVisibility(0);
      f_pos.setAdjustEnabled(true);
      let parentParent = f_pos.board.parent.parent.parent;
      setTouchable(parentParent, true);
    });
    eventSub.on('posFinish', function() {
      x = f_pos.getX();
      y = f_pos.getY();
      playW = f_pos.getWidth() - posExt;
      playH = f_pos.getHeight() - posExt;
      let ret = divideTwoCellOnce(3, 2, playH, 5, 4, playW);
      keySize = ret.x;
      spanSize = ret.y;
      pos = getPos(x + keySize/2, y + keySize / 2, keySize + spanSize);
      let obj = storage.get(storage_key) || {};
      obj.pos = pos;
      obj.x = x;
      obj.y = y;
      obj.playW = playW;
      obj.playH = playH;
      obj.keySize = keySize;
      obj.spanSize = spanSize;
      storage.put(storage_key, obj);
      f_btn.btn_position.setText('开始定位');
      f_btn.btn_play_start.setVisibility(0);
      f_btn.btn_speed.setVisibility(0);
      f_btn.btn_play_pause.setVisibility(8);
      f_pos.board.setVisibility(4);
      f_pos.setAdjustEnabled(false);
      let parentParent = f_pos.board.parent.parent.parent;
      setTouchable(parentParent, false);
      tip('初始化按键坐标完毕');
    });
  }
}

function f_tbnOpen() {
  f_btn = floaty.rawWindow(
    <frame id="board">
      <ScrollView h="{{device.width}}px" scrollbars="none">
        <vertical gravity="left">
          <button id="btn_exit" text="退出"/>
          <button id="btn_play_start" text="选择乐谱"/>
          <button id="btn_play_pause" text="暂停弹奏"/>
          <button id="btn_speed" text="倍速1x"/>
          <button id="btn_position" text="开始定位"/>
        </vertical>
      </ScrollView>
    </frame>
  );
  f_btn.setPosition(0, 0);
  f_btn.btn_exit.click(function() {
    exit();
  });
  f_btn.btn_play_start.click(function() {
    if (playing) {
      eventSub.emit('pause');
    }
    eventSub.emit('musicSelect');
  });
  f_btn.btn_play_pause.click(function() {
    if (!musicNotes || !musicNotes.length) {
      tip('请先选择乐谱');
      return;
    }
    eventSub.emit('pause');
  });
  f_btn.btn_speed.click(function() {
    if (playing) {
      eventSub.emit('pause');
    }
    eventSub.emit('speedOpen');
  });
  f_btn.btn_play_pause.setVisibility(8);
  f_btn.btn_position.click(function() {
    if (f_btn.btn_position.getText() == '定位好了') {  // 定位好了
      eventSub.emit('posFinish');
    } else {  // 开始定位
      eventSub.emit('posOpen');
    }
  });
}

function f_selectOpen() {
  f_select = floaty.rawWindow(
    <frame id="board" w="*" h="*" gravity="center">
      <vertical w="{{ device.height / 2 }}px" height="{{ device.width - 160 }}px" bg="#ffffffff">
        <horizontal id="search" w="*" bg="#ffefefef">
          <text id="btnSearch" padding="15" textSize="15sp" textColor="#ff0f9086">搜索</text>
          <input id="input" inputType="text" layout_weight="1" hint="输入关键词" textColorHint="#ffbbbbbb" android:imeOptions="actionDone" singleLine="true" focusable="true" focusableInTouchMode="true"></input>
          <text id="btnClear" padding="15" textSize="15sp" textColor="#ff0f9086">清除</text>
        </horizontal>
        <list id="list" w="*">
          <horizontal padding="10" w="*"><text textSize="15sp" textColor="#ff666666" text="{{this.name}}" w="*"></text></horizontal>
        </list>
      </vertical>
    </frame>
  );
  f_select.setSize(-1, -1);
  f_select.board.setVisibility(8);
  f_select.setTouchable(false);
  f_select.board.on('touch_down', () => {
    f_select.input.clearFocus();
    f_select.disableFocus();
    f_select.board.setVisibility(8);
    f_select.setTouchable(false);
  });
  f_select.input.setOnEditorActionListener(new android.widget.TextView.OnEditorActionListener((view, i, event) => {
    switch (i) {
      case EditorInfo.IME_ACTION_DONE:
        let keyword = f_select.input.getText().toString().trim();
        f_select.list.setDataSource(musicList.filter(v => {
          if (!keyword) {
            return true;
          }
          return v.indexOf(keyword) > -1;
        }).map(v => ({ name: v })));
        f_select.input.clearFocus();
        f_select.disableFocus();
        return false;
      default:
        return true;
    }
    
  }));
  f_select.input.on("touch_down", ()=> {
    f_select.requestFocus();
    f_select.input.requestFocus();
  });
  f_select.btnSearch.click(function() {
    let keyword = f_select.input.getText().toString().trim();
    f_select.list.setDataSource(musicList.filter(v => {
      if (!keyword) {
        return true;
      }
      return v.indexOf(keyword) > -1;
    }).map(v => ({ name: v })));
    f_select.input.clearFocus();
    f_select.disableFocus();
  });
  f_select.btnClear.click(function() {
    if (!f_select.input.getText().toString()) { return; }
    f_select.input.setText('');
    f_select.list.setDataSource(musicList.map(v => ({ name: v })));
  });
  f_select.list.on("item_click", function(item, itemView) {
    if (!files.isFile(musicDir + item.name + '.txt')) { tip('乐谱文件不存在, 请将乐谱文件(xxx.txt)复制到skyMusicAuto文件夹下', 'alert'); return; }
    try {
      let readable = files.open(musicDir + item.name + '.txt', 'r', 'x-UTF-16LE-BOM');
      let parsed = eval(readable.read())[0];
      readable.close();
      if(typeof(parsed.songNotes[0]) == 'number' || parsed.isEncrypted) {
        tip('乐谱文件已加密，无法弹奏，请更换乐谱', 'alert');
      } else {
        tip('读取乐谱成功');
        musicJSON = parsed;
        musicName = item.name;
        log(item.name);
        isPlay = true;
        f_select.board.setVisibility(8);
        f_select.setTouchable(false);
        eventSub.emit('musicParse');
      }
    } catch (err) {
      try {
        let readable = files.open(musicDir + item.name + '.txt', 'r', 'UTF-8');
        let parsed = eval(readable.read())[0];
        readable.close();
        if(typeof(parsed.songNotes[0]) == 'number' || parsed.isEncrypted) {
          tip('乐谱文件已加密，无法弹奏，请更换乐谱', 'alert');
        } else {
          tip('读取乐谱成功');
          musicJSON = parsed;
          musicName = item.name;
          log(item.name);
          isPlay = true;
          f_select.input.clearFocus();
          f_select.disableFocus();
          f_select.board.setVisibility(8);
          f_select.setTouchable(false);
          eventSub.emit('musicParse');
        }
      } catch (error) {
        log(error)
        tip('读取乐谱失败，请更换乐谱文件', 'alert');
      }
    }
  });
  f_select.list.setDataSource(musicList.map(v => ({ name: v })));
}

function exit() {
  floaty.closeAll();
  threads.shutDownAll();
  engines.stopAll();
}

function f_posOpen() {
  if (f_pos) { return; }
  f_pos = floaty.window(
    <frame id="board" gravity="center" bg="#44ffcc00">
      <vertical w="*" h="*" padding="10 10 10 10">
        <horizontal h="0" layout_weight="1">
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
        </horizontal>
        <horizontal h="0" layout_weight="1">
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
        </horizontal>
        <horizontal h="0" layout_weight="1">
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
          <text h="*" layout_weight="1" margin="4" bg="#22ffffff"></text>
        </horizontal>
      </vertical>
      <text color="#ffffff" gravity="center" w="*" h="*">覆盖全部琴键区域</text>
    </frame>
  );
  f_pos.board.setVisibility(4);
  resetPosWindow();
  f_pos.setAdjustEnabled(false);
  let parentParent = f_pos.board.parent.parent.parent;
  setTouchable(parentParent, false);
}

function resetPosWindow() {
  let windowW = Math.round(device.height * 0.8);
  let windowH = Math.round(device.width * 0.8);
  let windowX = Math.round((device.height - windowW) / 2);
  let windowY = Math.round((device.width - windowH) / 2);
  f_pos.setSize(windowW, windowH);
  f_pos.setPosition(windowX, windowY);
}

/**
 * @method 悬浮窗是否可触摸设置
 * @param {*} view 悬浮窗父对象
 * @param {*} touchable 是否可触摸
 */
 function setTouchable(view, touchable) {
  let params = view.getLayoutParams();
  if (touchable) {
    params.flags &= ~WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
  } else {
    params.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
  }
  windowManager = context.getSystemService(context.WINDOW_SERVICE);
  ui.run(function () {
    windowManager.updateViewLayout(view, params);
  });
}

/**
 * @method 获取乐谱列表
 */
 function musicItems() {
  if (files.isDir(musicDir)) {
    musicList = files.listDir(musicDir, function (name) {
      return name.endsWith('.txt') && files.isFile(files.join(musicDir, name));
    }).map(v => v.replace(/.txt$/, ''));
    sort(musicList);
    if (!musicList.length) {
      // tip('查询不到乐谱文件，请将乐谱文件放在skyMusicAuto目录下', 'alert');
      fileCopy('./res/music/', musicDir);
    }
  } else {
    // tip('skyMusicAuto文件夹不存在');
    if (files.create(musicDir)) {
      // tip('创建文件夹skyMusicAuto成功，请将谱子放入该文件夹', 'alert');
      fileCopy('./res/music/', musicDir);
    } else {
      tip('创建文件夹失败，请在根目录手动创建文件夹skyMusicAuto', 'alert');
    }
  }
}

/**
 * @method 选择/读取乐谱
 */
 function musicSelect() {
  isPlay = false;
  musicIndex = -1;
  if (!musicList.length) { return; }
  f_select.board.setVisibility(0);
  f_select.setTouchable(true);
}

/**
 * @method 解析乐谱
 */
function musicParse() {
  if (!isPlay) { return; }
  musicNotes = [];
  let time = musicJSON.songNotes[0].time;
  musicNotes.push({ time: time });
  musicNotes.push({ keys: [Number(musicJSON.songNotes[0].key.replace(/^(?:\d)?Key(\d{1,})$/, '$1'))] });
  for(let i = 1; i < musicJSON.songNotes.length; i++) {
    let key = Number(musicJSON.songNotes[i].key.replace(/^(?:\d)?Key(\d{1,})$/, '$1'));
    if (musicJSON.songNotes[i].time === musicJSON.songNotes[i - 1].time) {  // 同时按下
      musicNotes[musicNotes.length - 1].keys.push(key);
    } else {
      musicNotes.push({ time: musicJSON.songNotes[i].time - musicJSON.songNotes[i - 1].time });
      musicNotes.push({ keys: [key] });
    }
  }
  tip('解析乐谱完毕');
  eventSub.emit('playing');
}

function play() {
  threads.start(function() {
    for (let i = keyIndex; i < musicNotes.length; i++) {
      if (!playing) {
        break;
      }
      keyIndex = i;
      let v = musicNotes[i];
      if (v.keys) {
        let gestureMap = [];
        for (let keyIndex = 0; keyIndex < v.keys.length; keyIndex++) {
          let k = v.keys[keyIndex];
          gestureMap.push([0, 40, [pos[k].x, pos[k].y], [pos[k].x, pos[k].y]]);
        }
        let gestureStr = JSON.stringify(gestureMap);
        eval('gestures(' + gestureStr.substr(1, gestureStr.length - 2) + ');');
      } else {
        sleep(Math.round(v.time * (1 / speed)));
      }
    }
    playing = false;
    tip('弹奏完毕');
  });
}

/**
 * @method 初始化按键坐标
 * @param x 第一个按键x坐标
 * @param y 第一个按键y坐标
 * @param span 按键间隔
 */
 function getPos(x, y, span) {
  let position = {};
  for (let i = 0; i < 15; i++) {
    position[i] = {
      x: x + (i % 5) * span,
      y: y + Math.floor(i / 5) * span
    };
  }
  return position;
}

/**
 * @method 数组排序（中文+英文）
 * @param arr 需要排序的数组
 */
function sort(arr) {
  arr.sort(function (item1, item2) {
    return item1.localeCompare(item2);
  });
}

/**
 * @method 提示
 */
function tip(text, type) {
  if (type === 'alert') {
    alert(text);
  } else {
    toast(text);
  }
  log(text);
}

function divideTwoCellOnce(a, b, c, k, f, s) {
  let y = (c*k - s*a)/(b*k - a*f);
  let x = (c - b*y)/a;
  return {
    x: x,
    y: y
  }
}

function px2px(px) {
  let dpi = context.getResources().getDisplayMetrics().xdpi;
  return Math.ceil(px/403*dpi);
}

function fileCopy(fromPath, toPath) {
  /*格式:H.copy(原文件路径,要复制到的路径);*/
  /*解释:复制文件或文件夹（已存在则跳过） 返回是否复制成功*/
  fromPath = files.path(fromPath);
  toPath = files.path(toPath);
  var rp = /^([/][^\/:*?<>|]+[/]?)+$/;
  var rp1 = /^([/][^\/:*?<>|]+)+$/;
  var rp2 = /^([/][^\/:*?<>|]+)+[/]$/;
  try {
    if (rp.test(fromPath) == false || files.exists(fromPath) == false) throw "非法原文件地址,H.copy(?,);" + fromPath;
    if (rp.test(toPath) == false) throw "非法要复制到的路径地,H.copy(,?);" + toPath;
    if (rp1.test(fromPath) == true && rp1.test(toPath) == false) throw "非法要复制到的地址,H.copy(,?);" + toPath;
    if (rp2.test(fromPath) == true && rp2.test(toPath) == false) throw "非法要复制到的地址,H.copy(,?);" + toPath;
  } catch (err) {
    log(err);
    exit();
  }
  if (rp1.test(fromPath) == true) {
    /*复制文件*/
    return files.copy(fromPath, toPath);
  } else if (rp2.test(fromPath)) {
    /*复制文件夹*/
    /*获取原文件路径文件和文件夹*/
    var arr = getFilesFromPath(fromPath);
    /*遍历文件路径数组*/
    for (var i = 0; i < arr.length; i++) {
      /*原文件路径替换成目的路径*/
      var path = arr[i].replace(fromPath, toPath);
      /*判断路径类型*/
      if (files.isDir(arr[i])) {
        /*创建目的文件夹*/
        files.createWithDirs(path + "/");
      } else if (!files.exists(path) && files.isFile(arr[i])) {
        /*复制文件到目的文件路径*/
        files.copy(arr[i], path);
      }
    }
    /*获取目的路径文件和文件夹*/
    var arrToPath = getFilesFromPath(toPath);
    /*通过对比原文件和目的文件数量来返回是否复制成功*/
    if (arr.length <= arrToPath.length) {
      return true;
    } else {
      return false;
    }
  }
}

function getFilesFromPath(path) {
  /*格式:H.getFilesFromPath(文件夹路径)*/
  /*解释:获取指定路径所有文件和文件夹 递归遍历 返回文件路径数组*/
  path = files.path(path);
  var arrDir = new Array();
  var arrFile = new Array();
  try {
      var rp = /^([/][^\/:*?<>|]+[/]?)+$/;
      if (rp.test(path) == false) throw "非法文件路径,H.getFilesFromPath(?);" + path;
  } catch (err) {
      log(err);
      exit();
  }
  /*获取path目录下所有文件夹和文件*/
  var arr = files.listDir(path);
  /*遍历文件和文件夹*/
  for (var i = 0; i < arr.length; i++) {
    /*连接路径*/
    newPath = files.join(path, arr[i]);
    /*判断路径类型*/
    if (files.isDir(newPath)) {
      arrDir.push(newPath);
      /*递归遍历文件夹*/
      var arrF = getFilesFromPath(newPath);
      arrDir = arrDir.concat(arrF);
    } else if (files.isFile(newPath)) {
      /*过滤隐藏文件*/
      if (arr[i].slice(0, 1) != ".") {
        arrFile.push(newPath);
      }
    }
  }
  /*按字母升序排序数组*/
  arrDir.sort();
  arrFile.sort();
  /*连接数组并返回*/
  return arrDir.concat(arrFile);
}
