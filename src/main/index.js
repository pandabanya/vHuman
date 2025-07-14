'use strict'

import { app, protocol, BrowserWindow, ipcMain, net, globalShortcut } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
const { Worker } = require('worker_threads');
const path = require("path");
const isDevelopment = process.env.NODE_ENV !== 'production'
let isResponsive = true;
let mainWindow;
let workerWindow;
let socketWorker;
let createdAppProtocol = false

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, stream: true, corsEnabled: true, supportFetchAPI: true} }
])

app.commandLine.appendSwitch('enable-gpu-rasterization');


async function createWindow() {
  console.log('process.versions.modules', process.versions.modules)
  let width = process.env.VUE_APP_WINDOW_WIDTH
  let height = process.env.VUE_APP_WINDOW_HEIGHT
  let autoHideMenuBar = true
  let fullscreen = true
  if (isDevelopment) {
    width = 1080
    height = 1920
    autoHideMenuBar = false
    fullscreen = false
  }
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    autoHideMenuBar: autoHideMenuBar,
    fullscreen: fullscreen,
    webPreferences: {
      preload: path.join(__dirname, '/preload.js') ,
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
      contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
      enableRemoteModule: true
    }
  })

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await mainWindow.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) mainWindow.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    mainWindow.loadURL('app://./index.html')
  }

  startHeartbeat()
  startNetworkMonitoring()

  mainWindow.on('closed', () => {
    if (workerWindow) {
      workerWindow.close();
    }
    if (socketWorker) {
      socketWorker.terminate()
    }
    mainWindow = null;

  });

  // 注册esc，
  globalShortcut.register('ESC', function () {
    //  编写你的代码
    app.quit()
  })
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    toggleFullscreen()
  })
}

function createWorkerWindow(devPath, prodPath) {
  // create hidden worker window
  console.log('正在创建 Worker 窗口...');
  workerWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // 若使用 Node.js 功能时建议关闭
      webSecurity: false // 可能需要禁用以允许跨域请求
    }
  });
  if(process.env.WEBPACK_DEV_SERVER_URL) {
    console.log(`开发环境加载 URL: ${process.env.WEBPACK_DEV_SERVER_URL}/${devPath}`);
    workerWindow.loadURL(`${process.env.WEBPACK_DEV_SERVER_URL}/worker.html`);
  } else {
    console.log(`现网环境加载 URL: app://./${prodPath}`);
    workerWindow.loadURL(`app://./${prodPath}`)
  }
  workerWindow.on('closed', () => {
    console.log('Worker closed');
    workerWindow = null;
  });

  // setup message channels
  ipcMain.on('window-message-from-worker', (event, arg) => {
    // console.log('主线程收到来自worker的消息，转发renderer')
    if (mainWindow) {
      sendWindowMessage(mainWindow, 'message-from-worker', arg);
    }
  });

  // 开启调试工具，帮助查找问题
  if (isDevelopment) {
    workerWindow.webContents.openDevTools({ mode: 'detach' });
  }
  workerWindow.webContents.on('did-finish-load', () => {
    console.log('Worker 窗口加载完成');
  });
  workerWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Worker 窗口加载失败: ${errorDescription} (错误码: ${errorCode}) URL: ${validatedURL}`);
  });
}

function createWorker(name, fileName) {
  let workerPath = isDevelopment ? path.resolve(`./src/worker/${fileName}`) : path.join(__dirname, `worker/${fileName}`)
  console.log(`${name} worker path: ${workerPath}`)
  socketWorker = new Worker(workerPath); // worker.js 是一个独立的 JavaScript 文件

// 监听 Worker 返回的消息
  socketWorker.on('message', (msg) => {
    // console.log(`Message from ${name} Worker:`);
    sendWindowMessage(mainWindow, 'message-from-worker', msg)
  })

// 错误处理
  socketWorker.onerror = (error) => {
    console.error(`${name} Worker error:`, error);
  };

  // 监听 Worker 的退出事件
  socketWorker.on('exit', (code) => {
    if (code !== 0)
      console.error(`${name} Worker stopped with exit code ${code}`);
  });
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if(!createdAppProtocol) {
    createProtocol('app');
    createdAppProtocol = true;
  }
  createWindow()
  createWorkerWindow('worker.html', 'worker.html')

})

//  心跳检测函数
function startHeartbeat() {
  setInterval(() => {
    if (!isResponsive) {
      console.log("Application is not responsive. Taking action...");
      // 主进程卡住，执行重启操作
      relaunch()
    }
    isResponsive = false;
    // mainWindow.webContents.send('heartbeat');
    sendWindowMessage(mainWindow, 'heartbeat', null)
    console.info('----Sent heartbeat----')
  }, 60000); // 每5秒发送一次心跳
}

// 重启应用
function relaunch() {
  app.relaunch();
  app.exit(0);
}

// 网络检测
function startNetworkMonitoring() {
  checkNetworkStatus(); // 初次检查网络状态
  setInterval(checkNetworkStatus, 10000); // 每10秒检查一次网络状态
}

function checkNetworkStatus() {
  const request = net.request('https://www.baidu.com');
  request.on('response', (response) => {
    if (response.statusCode === 200) {
      // mainWindow.webContents.send('network-status', true);
      sendWindowMessage(mainWindow, 'network-status', true)
    } else {
      // mainWindow.webContents.send('network-status', false);
      sendWindowMessage(mainWindow, 'network-status', false)
    }
  });
  request.on('error', () => {
    // mainWindow.webContents.send('network-status', false);
    sendWindowMessage(mainWindow, 'network-status', false)
  });
  request.end();
}

function sendWindowMessage(targetWindow, channel, payload) {
  if(typeof targetWindow === 'undefined') {
    console.log('Target window does not exist');
    return;
  }
  if (targetWindow) {
    targetWindow.webContents.send(channel, payload);
  }
}

function toggleFullscreen() {
  mainWindow.setFullScreen(!mainWindow.isFullScreen())
  mainWindow.setFullScreenable(true)
  mainWindow.setAutoHideMenuBar(!mainWindow.isFullScreen())
}

//-------------------- 消息监听 -------------------------

// 监听心跳回应消息
ipcMain.on('heartbeat-response', () => {
  console.info('----receive heartbeat----')
  isResponsive = true;
});

ipcMain.on('restart-app', () => {
  console.info('----restart-app----')
  relaunch()
});

// 监听renderer线程发送的消息，并转发给worker线程
ipcMain.on('window-message-from-renderer', (event, args) => {
  // console.log('主线程收到来自renderer的消息，转发worker')
  if (workerWindow) {
    // 检查并转换 ArrayBuffer 为 Node.js Buffer
    if (args && args.type === 'image' && args.data instanceof ArrayBuffer) {
      const buffer = Buffer.from(args.data);
      sendWindowMessage(workerWindow, 'message-from-renderer', { type: 'image', data: buffer })
    } else if (args && args.type === 'cmd') {
      sendWindowMessage(workerWindow, 'message-from-renderer', args)
    } else {
      sendWindowMessage(workerWindow, 'message-from-renderer', { type: 'other', data: args })
    }
  }
});

// 监听renderer线程发送的全屏切换消息
ipcMain.on('toggle-fullscreen', (event, args) => {
  toggleFullscreen()
})


// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}

