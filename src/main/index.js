"use strict";

import {
  app,
  protocol,
  BrowserWindow,
  ipcMain,
  net,
  globalShortcut,
} from "electron";
import { createProtocol } from "vue-cli-plugin-electron-builder/lib";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";
const { Worker } = require("worker_threads");
const path = require("path");
const isDevelopment = process.env.NODE_ENV !== "production";
let isResponsive = true;
let mainWindow;
let workerWindow;
let socketWorker; // Worker线程，用于执行JavaScript文件
let createdAppProtocol = false;
// 添加定时器引用，方便清理
let heartbeatInterval = null;
let networkMonitorInterval = null;
// 存储所有创建的worker窗口
let allWorkerWindows = [];
// 添加标志表示应用是否正在退出
app.isQuiting = false;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      corsEnabled: true,
      supportFetchAPI: true,
    },
  },
]);

app.commandLine.appendSwitch("enable-gpu-rasterization");

async function createWindow() {
  console.log("process.versions.modules", process.versions.modules);
  let width = process.env.VUE_APP_WINDOW_WIDTH;
  let height = process.env.VUE_APP_WINDOW_HEIGHT;
  let autoHideMenuBar = true;
  let fullscreen = true;
  if (isDevelopment) {
    width = 1080;
    height = 1920;
    autoHideMenuBar = false;
    fullscreen = false;
  }
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    autoHideMenuBar: autoHideMenuBar,
    fullscreen: fullscreen,
    webPreferences: {
      preload: path.join(__dirname, "/preload.js"),
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
      contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
      enableRemoteModule: true,
      // 当设置为 false, 它将禁用同源策略 (通常用来测试网站),
      // 如果此选项不是由开发者设置的，还会把 allowRunningInsecureContent设置为 true. 默认值为 true。
      // allowRunningInsecureContent boolean (可选) - 允许一个 https 页面运行来自http url的JavaScript, CSS 或 plugins。 默认值为 false.
      webSecurity: false,
    },
  });

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await mainWindow.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
    if (!process.env.IS_TEST) mainWindow.webContents.openDevTools();
  } else {
    createProtocol("app");
    // Load the index.html when not in development
    mainWindow.loadURL("app://./index.html");
  }

  startHeartbeat();
  startNetworkMonitoring();

  mainWindow.on("closed", () => {
    console.log("主窗口被关闭，执行优雅关闭流程");
    
    // 执行优雅关闭，跳过主窗口关闭（因为已经在关闭中）
    gracefulShutdown(true);
    
    mainWindow = null;
  });

  // 🔧 新增：主窗口关闭前事件，确保worker窗口优先关闭
  mainWindow.on("close", (event) => {
    console.log("主窗口准备关闭，先关闭所有worker窗口");
    
    // 阻止默认关闭行为，先关闭worker窗口
    event.preventDefault();
    
    // 立即关闭所有worker窗口
    const closeWorkers = () => {
      console.log("强制关闭所有worker窗口");
      
      // 关闭iris worker窗口
      if (workerWindow && !workerWindow.isDestroyed()) {
        console.log("关闭iris worker窗口");
        workerWindow.destroy(); // 使用destroy而不是close，确保立即关闭
        workerWindow = null;
      }
      
      // 关闭所有其他worker窗口
      allWorkerWindows.forEach((worker, index) => {
        if (worker && !worker.isDestroyed()) {
          console.log(`强制关闭worker窗口 ${index}`);
          worker.destroy();
        }
      });
      allWorkerWindows = [];
      
      // 清理socket worker
      if (socketWorker) {
        console.log("终止socket worker");
        socketWorker.terminate();
        socketWorker = null;
      }
      
      // 现在安全关闭主窗口
      console.log("Worker窗口已清理，现在关闭主窗口");
      setImmediate(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy(); // 直接销毁主窗口
        }
      });
    };
    
    // 立即执行worker清理
    closeWorkers();
  });

  // 注册esc，
  globalShortcut.register("ESC", function () {
    console.log("ESC键被按下，强制退出应用");
    
    // 标记正在退出，防止重复处理
    if (global.isExiting) {
      console.log("应用已在退出流程中");
      return;
    }
    global.isExiting = true;
    
    // 立即强制退出，不等待worker清理
    const forceExit = () => {
      console.log("🚨 ESC强制退出：立即终止所有进程");
      
      // 1. 立即销毁所有窗口
      if (workerWindow && !workerWindow.isDestroyed()) {
        console.log("ESC强制关闭iris worker");
        try {
          workerWindow.destroy();
        } catch (e) {
          console.warn("强制关闭iris worker失败:", e);
        }
      }
      
      // 注意：socketWorker是Worker线程，不是BrowserWindow，所以没有socketWorkerWindow
      // 这里不需要处理socketWorkerWindow，因为socketWorker是线程worker，不是窗口worker
      
      if (socketWorker) {
        console.log("ESC强制终止socket worker线程");
        try {
          socketWorker.terminate();
        } catch (e) {
          console.warn("强制终止socket worker失败:", e);
        }
      }
      
      allWorkerWindows.forEach((worker, index) => {
        if (worker && !worker.isDestroyed()) {
          console.log(`ESC强制关闭worker${index}`);
          try {
            worker.destroy();
          } catch (e) {
            console.warn(`强制关闭worker${index}失败:`, e);
          }
        }
      });
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log("ESC强制关闭主窗口");
        try {
          mainWindow.destroy();
        } catch (e) {
          console.warn("强制关闭主窗口失败:", e);
        }
      }
      
      // 2. 立即退出应用
      console.log("🚨 ESC强制退出应用");
      app.exit(0);
    };
    
    // 立即执行强制退出，不等待
    forceExit();
  });
  globalShortcut.register("CommandOrControl+Shift+F", () => {
    toggleFullscreen();
  });
}

function createWorkerWindow(devPath, prodPath, pageName) {
  // create hidden worker window
  console.log("正在创建 Worker 窗口...");
  workerWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // 若使用 Node.js 功能时建议关闭
      webSecurity: false, // 可能需要禁用以允许跨域请求
    },
  });
  if (process.env.WEBPACK_DEV_SERVER_URL) {
    console.log(
      `开发环境加载 URL: ${process.env.WEBPACK_DEV_SERVER_URL}/${devPath}`
    );
    workerWindow.loadURL(
      `${process.env.WEBPACK_DEV_SERVER_URL}/${pageName}.html`
    );
  } else {
    console.log(`现网环境加载 URL: app://./${prodPath}`);
    workerWindow.loadURL(`app://./${prodPath}`);
  }
  workerWindow.on("closed", () => {
    console.log("Worker closed");
    workerWindow = null;
  });

  // setup message channels
  ipcMain.on("window-message-from-worker", (event, arg) => {
    // console.log('主线程收到来自worker的消息，转发renderer')
    if (mainWindow) {
      sendWindowMessage(mainWindow, "message-from-worker", arg);
    }
  });
  
  // 🔧 新增：提供资源路径给worker
  ipcMain.handle('get-app-path', () => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    let resourcePath;
    
    if (isDevelopment) {
      // 开发环境：返回项目根目录
      resourcePath = process.cwd();
    } else {
      // 生产环境：优先使用app.getAppPath()，这通常指向win-unpacked目录
      // worker中会检查这个路径下的resources文件夹
      resourcePath = app.getAppPath();
    }
    
    console.log('🔧 提供应用路径给worker:', {
      isDevelopment,
      providedPath: resourcePath,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      cwd: process.cwd()
    });
    
    return resourcePath;
  });

  // 开启调试工具，帮助查找问题
  if (isDevelopment) {
    workerWindow.webContents.openDevTools({ mode: "detach" });
  }
  workerWindow.webContents.on("did-finish-load", () => {
    console.log("Worker 窗口加载完成");
  });
  workerWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `Worker 窗口加载失败: ${errorDescription} (错误码: ${errorCode}) URL: ${validatedURL}`
      );
    }
  );
}

function createWorker(name, fileName) {
  let workerPath = isDevelopment
    ? path.resolve(`./src/worker/${fileName}`)
    : path.join(__dirname, `worker/${fileName}`);
  console.log(`${name} worker path: ${workerPath}`);
  socketWorker = new Worker(workerPath); // worker.js 是一个独立的 JavaScript 文件

  // 监听 Worker 返回的消息
  socketWorker.on("message", (msg) => {
    // console.log(`Message from ${name} Worker:`);
    sendWindowMessage(mainWindow, "message-from-worker", msg);
  });

  // 错误处理
  socketWorker.onerror = (error) => {
    console.error(`${name} Worker error:`, error);
  };

  // 监听 Worker 的退出事件
  socketWorker.on("exit", (code) => {
    if (code !== 0)
      console.error(`${name} Worker stopped with exit code ${code}`);
  });
}

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  // 如果不是通过ESC键退出，也执行优雅关闭
  if (!app.isQuiting) {
    gracefulShutdown();
  }
  
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  if (!createdAppProtocol) {
    createProtocol("app");
    createdAppProtocol = true;
  }

  // 创建一个加载进度提示窗口
  const loadingWin = new BrowserWindow({
    width: 600,  // 增加宽度：400 → 600
    height: 450, // 进一步增加高度：400 → 450，适应新的padding
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // 显示简单加载提示
  loadingWin.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(`
    <html>
      <head>
        <style>
          body {
            background: radial-gradient(circle at center, rgba(0,20,40,0.95), rgba(0,0,0,0.98));
            color: white;
            font-family: 'Microsoft YaHei', 'Arial', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            overflow: hidden;
            position: relative;
          }
          
          /* 动态背景粒子效果 */
          body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
              radial-gradient(circle at 20% 30%, rgba(0,150,255,0.1) 0%, transparent 50%),
              radial-gradient(circle at 80% 70%, rgba(255,0,150,0.1) 0%, transparent 50%),
              radial-gradient(circle at 50% 10%, rgba(0,255,150,0.08) 0%, transparent 50%);
            animation: floatParticles 8s ease-in-out infinite;
            z-index: 0;
          }
          
          @keyframes floatParticles {
            0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.3; }
            33% { transform: translateY(-20px) rotate(120deg); opacity: 0.6; }
            66% { transform: translateY(10px) rotate(240deg); opacity: 0.4; }
          }
          
          .loading-container {
            text-align: center;
            padding: 70px 40px 60px 40px; /* 大幅增加上下padding */
            border-radius: 20px;
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(20px);
            box-shadow: 
              0 0 60px rgba(0,150,255,0.2),
              0 0 120px rgba(0,150,255,0.1),
              inset 0 1px 0 rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.1);
            position: relative;
            z-index: 1;
            max-width: 500px;
            animation: containerGlow 3s ease-in-out infinite alternate;
          }
          
          @keyframes containerGlow {
            0% { box-shadow: 0 0 60px rgba(0,150,255,0.2), 0 0 120px rgba(0,150,255,0.1), inset 0 1px 0 rgba(255,255,255,0.1); }
            100% { box-shadow: 0 0 80px rgba(0,150,255,0.3), 0 0 160px rgba(0,150,255,0.15), inset 0 1px 0 rgba(255,255,255,0.15); }
          }
          
          .loading-title {
            font-size: 28px;
            font-weight: 300;
            margin-top: 20px;    /* 进一步增加上边距 */
            margin-bottom: 40px; /* 也增加下边距 */
            color: #ffffff;
            text-shadow: 
              0 0 10px rgba(0,150,255,0.5),
              0 2px 4px rgba(0,0,0,0.5);
            letter-spacing: 2px;
            position: relative;
          }
          
          .loading-title::after {
            content: '';
            position: absolute;
            bottom: -10px;
            left: 50%;
            transform: translateX(-50%);
            width: 60px;
            height: 2px;
            background: linear-gradient(90deg, transparent, #00aaff, transparent);
            animation: titleUnderline 2s ease-in-out infinite;
          }
          
          @keyframes titleUnderline {
            0%, 100% { width: 60px; opacity: 0.5; }
            50% { width: 120px; opacity: 1; }
          }
          
          .progress-container {
            width: 400px;
            height: 12px;
            background: rgba(255,255,255,0.1);
            border-radius: 6px;
            overflow: hidden;
            margin: 30px auto;
            position: relative;
            border: 1px solid rgba(0,150,255,0.3);
            box-shadow: 
              inset 0 2px 4px rgba(0,0,0,0.3),
              0 0 20px rgba(0,150,255,0.2);
          }
          
          .progress-container::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            animation: shimmer 2s linear infinite;
          }
          
          @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
          }
          
          .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, 
              #00aaff 0%, 
              #0088cc 25%, 
              #00aaff 50%, 
              #0099dd 75%, 
              #00aaff 100%);
            background-size: 200% 100%;
            animation: gradient 3s ease-in-out infinite;
            width: 0%;
            transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 6px;
            position: relative;
            box-shadow: 
              0 0 20px rgba(0,170,255,0.6),
              inset 0 1px 0 rgba(255,255,255,0.3);
          }
          
          .progress-bar::after {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 20px;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4));
            border-radius: 0 6px 6px 0;
          }
          
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          
          .progress-text {
            font-size: 16px;
            margin-top: 20px;
            color: #e0e0e0;
            opacity: 0.9;
            font-weight: 300;
          }
          
          .loading-dots {
            display: inline-block;
            animation: dots 1.5s infinite;
          }
          
          @keyframes dots {
            0%, 20% { content: ''; }
            40% { content: '.'; }
            60% { content: '..'; }
            80%, 100% { content: '...'; }
          }
          
          .loading-dots::after {
            content: '';
            animation: dots 1.5s infinite;
          }
          
          .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #00aaff;
            margin-right: 12px;
            animation: pulse 2s ease-in-out infinite;
            box-shadow: 
              0 0 10px rgba(0,170,255,0.6),
              0 0 20px rgba(0,170,255,0.3);
          }
          @keyframes pulse {
            0% { opacity: 0.6; transform: scale(1); box-shadow: 0 0 10px rgba(0,170,255,0.6), 0 0 20px rgba(0,170,255,0.3); }
            50% { opacity: 1; transform: scale(1.3); box-shadow: 0 0 20px rgba(0,170,255,0.8), 0 0 40px rgba(0,170,255,0.5); }
            100% { opacity: 0.6; transform: scale(1); box-shadow: 0 0 10px rgba(0,170,255,0.6), 0 0 20px rgba(0,170,255,0.3); }
          }
          
          .loading-steps {
            margin-top: 25px;
            font-size: 14px;
            color: #b0b0b0;
            padding: 20px;
            background: rgba(0,0,0,0.2);
            border-radius: 15px;
            border: 1px solid rgba(0,150,255,0.2);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
          }
          
          .step-item {
            display: flex;
            align-items: center;
            margin: 8px 0;
            opacity: 0.4;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            padding: 8px 12px;
            border-radius: 8px;
            position: relative;
            font-weight: 300;
          }
          
          .step-item::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(0,150,255,0.1), transparent);
            border-radius: 8px;
            opacity: 0;
            transition: opacity 0.3s ease;
          }
          
          .step-item.active {
            opacity: 1;
            color: #00aaff;
            background: rgba(0,170,255,0.05);
            border: 1px solid rgba(0,170,255,0.2);
            transform: translateX(5px);
          }
          
          .step-item.active::before {
            opacity: 1;
            animation: stepScan 2s linear infinite;
          }
          
          @keyframes stepScan {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          
          .step-item.completed {
            opacity: 1;
            color: #00ff88;
            background: rgba(0,255,136,0.05);
            border: 1px solid rgba(0,255,136,0.3);
            transform: translateX(0px);
          }
          
          .step-icon {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #555;
            margin-right: 12px;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            border: 2px solid #666;
          }
          
          .step-item.active .step-icon {
            background: #00aaff;
            border: 2px solid #0088cc;
            animation: iconPulse 1.5s ease-in-out infinite;
            box-shadow: 
              0 0 15px rgba(0,170,255,0.6),
              0 0 30px rgba(0,170,255,0.3);
          }
          
          @keyframes iconPulse {
            0%, 100% { 
              transform: scale(1); 
              box-shadow: 0 0 15px rgba(0,170,255,0.6), 0 0 30px rgba(0,170,255,0.3);
            }
            50% { 
              transform: scale(1.2); 
              box-shadow: 0 0 25px rgba(0,170,255,0.8), 0 0 50px rgba(0,170,255,0.5);
            }
          }
          
          .step-item.completed .step-icon {
            background: #00ff88;
            border: 2px solid #00cc66;
            animation: none;
            box-shadow: 
              0 0 15px rgba(0,255,136,0.6),
              0 0 30px rgba(0,255,136,0.3);
            position: relative;
          }
          
          .step-item.completed .step-icon::after {
            content: '✓';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 10px;
            font-weight: bold;
            text-shadow: 0 0 5px rgba(0,0,0,0.5);
          }
          
          /* 增加整体的科技感氛围 */
          @keyframes scan {
            0% { transform: translateY(-100%); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translateY(100%); opacity: 0; }
          }
          
          .loading-container::after {
            content: '';
            position: absolute;
            top: 30px;  /* 适应新的padding，进一步下移 */
            left: 30px;
            width: calc(100% - 60px);  /* 调整宽度适应左右边距 */
            height: 2px;
            background: linear-gradient(90deg, transparent, #00aaff, transparent);
            animation: scan 3s ease-in-out infinite;
          }
        </style>
      </head>
      <body>
        <div class="loading-container">
          <div class="loading-title">🚀 数字人系统启动中</div>
          <div class="progress-container">
            <div class="progress-bar" id="progressBar"></div>
        </div>
          <div class="progress-text">
            <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
              <span class="status-indicator" id="statusIndicator"></span>
              <span id="progressText">正在初始化核心组件</span>
            </div>
            <div id="progressPercent" style="font-size: 18px; font-weight: 500; color: #00aaff;">0%</div>
          </div>
          <div class="loading-steps" id="loadingSteps">
            <div class="step-item" id="step1">
              <div class="step-icon"></div>
              <span>🔧 系统初始化</span>
            </div>
            <div class="step-item" id="step2">
              <div class="step-icon"></div>
              <span>🧠 加载AI模型</span>
            </div>
            <div class="step-item" id="step3">
              <div class="step-icon"></div>
              <span>⚡ 启动核心服务</span>
            </div>
            <div class="step-item" id="step4">
              <div class="step-icon"></div>
              <span>✨ 完成配置</span>
            </div>
          </div>
        </div>
        
        <script>
          let currentStep = 0;
          let maxReachedProgress = 0; // 记录达到过的最大进度
          let stepStates = [false, false, false, false]; // 记录每个步骤是否已经完成
          
          // 平滑进度更新函数
          function updateProgress(targetPercent, text) {
            const progressBar = document.getElementById('progressBar');
            const progressPercent = document.getElementById('progressPercent');
            const progressText = document.getElementById('progressText');
            
            if (text) {
              progressText.textContent = text;
            }
            
            // 确保进度只能向前，不能倒退
            targetPercent = Math.max(targetPercent, maxReachedProgress);
            maxReachedProgress = targetPercent;
            
            // 更新步骤状态
            updateStepStatus(targetPercent);
            
            // 平滑动画到目标进度
            const currentPercent = parseInt(progressBar.style.width) || 0;
            const increment = (targetPercent - currentPercent) / 30; // 分30步完成动画
            
            let step = 0;
            const animate = () => {
              if (step < 30) {
                const newPercent = Math.min(currentPercent + increment * (step + 1), targetPercent);
                progressBar.style.width = newPercent + '%';
                progressPercent.textContent = Math.round(newPercent) + '%';
                step++;
                setTimeout(animate, 33); // 每33ms更新一次，总共1秒完成
              }
            };
            animate();
          }
          
          // 更新步骤状态 - 防止倒退版本
          function updateStepStatus(percent) {
            const steps = ['step1', 'step2', 'step3', 'step4'];
            const thresholds = [
              { start: 0, complete: 25 },
              { start: 25, complete: 60 },
              { start: 60, complete: 85 },
              { start: 85, complete: 100 }
            ];
            
            steps.forEach(function(stepId, index) {
              const stepElement = document.getElementById(stepId);
              const threshold = thresholds[index];
              
              // 如果步骤已经完成过，就不再改变状态
              if (stepStates[index]) {
                return;
              }
              
              if (percent >= threshold.complete) {
                // 步骤完成 - 标记为永久完成
                stepElement.classList.remove('active');
                stepElement.classList.add('completed');
                stepStates[index] = true;
                console.log('Step ' + (index + 1) + ' completed permanently');
              } else if (percent >= threshold.start) {
                // 步骤正在进行
                stepElement.classList.add('active');
                stepElement.classList.remove('completed');
              } else {
                // 步骤未开始
                stepElement.classList.remove('active', 'completed');
              }
            });
            
            console.log('Progress: ' + percent + '%, Step states: ' + stepStates.join(','));
          }
          
          // 重置步骤状态（调试用）
          function resetStepStatus() {
            stepStates = [false, false, false, false];
            maxReachedProgress = 0;
            const steps = ['step1', 'step2', 'step3', 'step4'];
            steps.forEach(function(stepId) {
              const stepElement = document.getElementById(stepId);
              stepElement.classList.remove('active', 'completed');
            });
            console.log('Steps reset');
          }
          
          // 初始化
          updateProgress(5, '正在启动系统');
        </script>
      </body>
    </html>
  `)}`);

  // 先创建worker窗口
  try {
    // 创建进度管理器
    const progressManager = createProgressManager(loadingWin);
    
    // 阶段1：系统初始化 (0-25%)
    await progressManager.updateProgress(15, '正在初始化系统组件');
    
    await progressManager.updateProgress(25, '系统组件初始化完成');
    
    // 阶段2：加载核心AI模型 (25-60%)
    await progressManager.updateProgress(30, '正在加载人脸识别模型');
    
    const irisWorkerPromise = createWorkerWindowPromise(
      "irisWorker.html",
      "irisWorker.html",
      "irisWorker",
      progressManager,
      30, // 起始进度
      60  // 目标进度
    );
    
    // 阶段3：启动辅助服务 (60-85%)
    const workerPromise = createWorkerWindowPromise(
      "worker.html",
      "worker.html",
      "worker",
      progressManager,
      60, // 起始进度
      85  // 目标进度
    );
    
    // 等待所有worker加载完成
    await irisWorkerPromise;
    await workerPromise;
    
    // 阶段4：完成最终配置 (85-100%)
    await progressManager.updateProgress(90, '正在完成系统配置');
    // 优化：减少延迟从400ms到50ms
    
    await progressManager.updateProgress(95, '系统配置完成');
    
    await progressManager.updateProgress(100, '系统启动完成');
    // 优化：减少加载延迟从800ms到100ms

    // 显示启动完成消息
    await progressManager.updateProgress(100, '🎉 欢迎使用数字人系统');
    await new Promise(resolve => setTimeout(resolve, 500));

    // 当worker加载完成后再创建主窗口
    createWindow();
    
    // 添加淡出效果后关闭加载窗口
    if (loadingWin && !loadingWin.isDestroyed()) {
      loadingWin.webContents.executeJavaScript(`
        document.body.style.transition = 'opacity 0.5s ease-out';
        document.body.style.opacity = '0';
      `);
      setTimeout(() => {
        if (!loadingWin.isDestroyed()) {
    loadingWin.close();
        }
      }, 500);
    }
  } catch (error) {
    console.error("加载工作线程失败:", error);
    
    // 显示错误信息
    if (loadingWin && !loadingWin.isDestroyed()) {
      await progressManager.updateProgress(0, '❌ 系统启动失败，正在使用备用模式');
      // 优化：减少加载完成后的等待时间从1500ms到300ms
    loadingWin.close();
    }
    
    // 即使工作线程加载失败也尝试创建主窗口
    createWindow();
  }
});

// 创建进度管理器
function createProgressManager(loadingWin) {
  let lastProgress = 0;
  let updateQueue = [];
  let isUpdating = false;
  
  const processQueue = async () => {
    if (isUpdating || updateQueue.length === 0) {
      return;
    }
    
    isUpdating = true;
    const { targetPercent, text, resolve, force } = updateQueue.shift();
    
    // 确保进度只能向前
    const safePercent = force ? targetPercent : Math.max(targetPercent, lastProgress);
    lastProgress = safePercent;
    
    if (loadingWin && !loadingWin.isDestroyed()) {
      // 开发模式下输出详细日志
      if (isDevelopment) {
        console.log(`🔄 Progress Update: ${safePercent}% - ${text} (原始: ${targetPercent}%)`);
      }
      
      try {
        await loadingWin.webContents.executeJavaScript(`
          if (typeof updateProgress === 'function') {
            updateProgress(${safePercent}, '${text}');
          }
        `);
        // 给动画一些时间完成
        // 优化：减少进度更新延迟从150ms到30ms
      await new Promise(r => setTimeout(r, 30));
      } catch (error) {
        console.error('更新进度失败:', error);
      }
    }
    
    resolve();
    isUpdating = false;
    
    // 处理队列中的下一个更新
            // 优化：减少队列处理延迟从50ms到10ms
        setTimeout(processQueue, 10);
  };
  
  return {
    updateProgress: async (targetPercent, text) => {
      return new Promise((resolve) => {
        updateQueue.push({ targetPercent, text, resolve });
        processQueue();
      });
    },
    
    // 强制更新进度（忽略防倒退机制）
    forceUpdateProgress: async (targetPercent, text) => {
      return new Promise((resolve) => {
        updateQueue.push({ targetPercent, text, resolve, force: true });
        processQueue();
      });
    },
    
    // 重置进度
    reset: () => {
      lastProgress = 0;
      updateQueue = [];
      isUpdating = false;
      if (loadingWin && !loadingWin.isDestroyed()) {
        loadingWin.webContents.executeJavaScript(`
          if (typeof resetStepStatus === 'function') {
            resetStepStatus();
          }
        `);
      }
    }
  };
}

// 添加基于Promise的worker窗口创建函数
function createWorkerWindowPromise(
  devPath,
  prodPath,
  pageName,
  progressManager,
  startProgress,
  endProgress
) {
  return new Promise(async (resolve, reject) => {
    console.log(`正在创建 ${pageName} 窗口...`);

    // 更新开始加载进度
    const progressStep = (endProgress - startProgress) / 5; // 分5个阶段，更细粒度
    await progressManager.updateProgress(startProgress, `正在加载 ${pageName} 模块`);

    const workerWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false,
        additionalArguments: [`--worker-type=${pageName}`],
      },
    });

    // 添加错误处理和重试机制
    let retryCount = 0;
    const maxRetries = 3;

    const loadWorker = async () => {
      const url = process.env.WEBPACK_DEV_SERVER_URL
        ? `${process.env.WEBPACK_DEV_SERVER_URL}/${pageName}.html`
        : `app://./${pageName}.html`;

      console.log(`加载 ${pageName}: ${url}`);
      
      // 更新进度：开始加载文件
      await progressManager.updateProgress(
        startProgress + progressStep * 1, 
        `正在下载 ${pageName} 资源文件`
      );
      
      workerWin.loadURL(url);
    };
    
    // 开启调试工具，帮助查找问题
    if (isDevelopment) {
      workerWin.webContents.openDevTools({ mode: "detach" });
    }
    
    workerWin.webContents.on(
      "did-fail-load",
      async (event, errorCode, errorDescription) => {
        console.error(`${pageName} 加载失败:`, errorDescription);

        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`重试 ${retryCount}/${maxRetries}...`);
          await progressManager.updateProgress(
            startProgress + progressStep * 1.5, 
            `${pageName} 加载失败，正在重试 (${retryCount}/${maxRetries})`
          );
          // 优化：减少Worker重试延迟从1000ms到200ms
      setTimeout(loadWorker, 200);
        } else {
          reject(new Error(`${pageName} 加载失败次数过多`));
        }
      }
    );

    workerWin.webContents.on("did-finish-load", async () => {
      console.log(`${pageName} 加载完成`);
      
      // 更新进度：文件加载完成
      await progressManager.updateProgress(
        startProgress + progressStep * 2, 
        `${pageName} 文件加载完成`
      );

      if (pageName === "irisWorker") {
        workerWindow = workerWin;
        
        // iris worker初始化过程分步骤
        await progressManager.updateProgress(
          startProgress + progressStep * 3, 
          '正在加载人脸识别模型'
        );
        
        await progressManager.updateProgress(
          startProgress + progressStep * 4, 
          '正在初始化识别引擎'
        );
        
      } else {
        // 其他worker初始化较快
        await progressManager.updateProgress(
          startProgress + progressStep * 3, 
          `正在配置 ${pageName} 服务`
        );
        
        await progressManager.updateProgress(
          startProgress + progressStep * 4, 
          `正在启动 ${pageName} 服务`
        );
      }
      
      // 将worker窗口添加到全局数组中，方便统一管理
      allWorkerWindows.push(workerWin);

      // 设置消息通道
      ipcMain.on("window-message-from-worker", (event, arg) => {
        if (mainWindow) {
          sendWindowMessage(mainWindow, "message-from-worker", arg);
        }
      });
      
      // 最终进度更新
      await progressManager.updateProgress(
        endProgress, 
        `${pageName} 模块就绪`
      );

      resolve(workerWin);
    });

    // 开始加载
    loadWorker();
  });
}

//  心跳检测函数
function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    // 检查应用是否正在退出
    if (app.isQuiting || !mainWindow || mainWindow.isDestroyed()) {
      console.log("应用正在退出或窗口已关闭，停止心跳检测");
      clearInterval(heartbeatInterval);
      return;
    }
    
    if (!isResponsive) {
      console.log("Application is not responsive. Taking action...");
      // 主进程卡住，执行重启操作
      relaunch();
    }
    isResponsive = false;
    // 使用已经加入安全检查的sendWindowMessage函数
    sendWindowMessage(mainWindow, "heartbeat", null);
    console.info("----Sent heartbeat----");
  }, 60000); // 每60秒发送一次心跳
  
  // 当应用退出时清除定时器
  app.on('before-quit', () => {
    console.log("应用退出前，清除心跳检测定时器");
    clearInterval(heartbeatInterval);
  });
}

// 重启应用
function relaunch() {
  app.relaunch();
  app.exit(0);
}

// 网络检测
function startNetworkMonitoring() {
  checkNetworkStatus(); // 初次检查网络状态
  networkMonitorInterval = setInterval(checkNetworkStatus, 10000); // 每10秒检查一次网络状态
}

function checkNetworkStatus() {
  const request = net.request("https://www.baidu.com");
  request.on("response", (response) => {
    if (response.statusCode === 200) {
      // mainWindow.webContents.send('network-status', true);
      sendWindowMessage(mainWindow, "network-status", true);
    } else {
      // mainWindow.webContents.send('network-status', false);
      sendWindowMessage(mainWindow, "network-status", false);
    }
  });
  request.on("error", () => {
    // mainWindow.webContents.send('network-status', false);
    sendWindowMessage(mainWindow, "network-status", false);
  });
  request.end();
}

function sendWindowMessage(targetWindow, channel, payload) {
  if (typeof targetWindow === "undefined" || !targetWindow) {
    console.log("Target window does not exist");
    return;
  }
  
  // 检查窗口是否已被销毁
  if (targetWindow.isDestroyed()) {
    console.log("Target window has been destroyed");
    return;
  }
  
  try {
    targetWindow.webContents.send(channel, payload);
  } catch (error) {
    console.error("发送消息到窗口失败:", error);
  }
}

function toggleFullscreen() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.log("主窗口已关闭，无法切换全屏");
    return;
  }
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  mainWindow.setFullScreenable(true);
  mainWindow.setAutoHideMenuBar(!mainWindow.isFullScreen());
}

//-------------------- 消息监听 -------------------------

// 监听心跳回应消息
ipcMain.on("heartbeat-response", () => {
  console.info("----receive heartbeat----");
  isResponsive = true;
});

ipcMain.on("restart-app", () => {
  console.info("----restart-app----");
  relaunch();
});

// 监听renderer线程发送的消息，并转发给worker线程
ipcMain.on("window-message-from-renderer", (event, args) => {
  console.log("主线程收到来自renderer的消息，转发worker");
  console.log("args", args);
  console.log(typeof args.data);

  if (workerWindow) {
    // 检查并转换 ArrayBuffer 为 Node.js Buffer
    if (args && args.type === "image" && args.data instanceof ArrayBuffer) {
      const buffer = Buffer.from(args.data);
      sendWindowMessage(workerWindow, "message-from-renderer", {
        type: "image",
        data: buffer,
      });
    } else if (args && args.type === "cmd") {
      sendWindowMessage(workerWindow, "message-from-renderer", args);
    } else if (args && args.type === "imageFromVideoToDetect") {
      sendWindowMessage(workerWindow, "message-from-renderer", {
        type: "imageFromVideoToDetect",
        data: args.data,
        timestamp: args.timestamp,
        frameInfo: args.frameInfo
      });
    } else if (args && ['healthCheck', 'garbageCollection', 'resetWorker'].includes(args.type)) {
      // 直接转发健康检查、垃圾回收和重置请求
      console.log(`转发${args.type}请求到worker`);
      sendWindowMessage(workerWindow, "message-from-renderer", args);
    } else {
      sendWindowMessage(workerWindow, "message-from-renderer", {
        type: "other",
        data: args,
      });
    }
  } else {
    console.warn("worker窗口不存在，无法转发消息:", args.type);
    // 如果worker窗口不存在，向renderer报告错误
    if (mainWindow) {
      sendWindowMessage(mainWindow, "message-from-worker", {
        type: 'irisError',
        data: 'worker窗口不存在'
      });
    }
  }
});

// 监听renderer线程发送的全屏切换消息
ipcMain.on("toggle-fullscreen", (event, args) => {
  toggleFullscreen();
});

ipcMain.on("window-set-fullscreen", (event, args) => {
  toggleFullscreen();
  // mainWindow.setMenuBarVisibility(false)
  mainWindow.setVisibleOnAllWorkspaces(true);
});

// 新增：监听设置窗口置顶的消息
ipcMain.on("window-set-always-on-top", (event, alwaysOnTop) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(alwaysOnTop);
    console.log(`窗口置顶状态设置为: ${alwaysOnTop}`);
  }
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", (data) => {
      if (data === "graceful-exit") {
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      app.quit();
    });
  }
}

// 优雅关闭函数，统一清理所有资源
function gracefulShutdown(skipMainWindow = false) {
  console.log("开始执行优雅关闭...");
  
  // 设置退出标志
  app.isQuiting = true;
  
  // 清理所有定时器
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log("心跳检测定时器已清理");
  }
  
  if (networkMonitorInterval) {
    clearInterval(networkMonitorInterval);
    networkMonitorInterval = null;
    console.log("网络监控定时器已清理");
  }
  
  // 清理所有worker窗口
  allWorkerWindows.forEach((worker, index) => {
    if (worker && !worker.isDestroyed()) {
      console.log(`正在关闭worker窗口 ${index}`);
      worker.close();
    }
  });
  allWorkerWindows = [];
  
  // 清理主要的worker窗口引用
  if (workerWindow && !workerWindow.isDestroyed()) {
    console.log("正在关闭主worker窗口");
    workerWindow.close();
    workerWindow = null;
  }
  
  // 终止socket worker线程
  if (socketWorker) {
    console.log("正在终止socket worker线程");
    socketWorker.terminate();
    socketWorker = null;
  }
  
  // 释放所有快捷键
  globalShortcut.unregisterAll();
  console.log("全局快捷键已释放");
  
  // 关闭主窗口（如果不是从主窗口关闭事件中调用的）
  if (!skipMainWindow && mainWindow && !mainWindow.isDestroyed()) {
    console.log("正在关闭主窗口");
    mainWindow.close();
    mainWindow = null;
  }
  
  console.log("优雅关闭完成");
}

// 当应用退出前，确保所有资源都被清理
app.on('before-quit', () => {
  console.log("应用退出前，执行最终清理");
  if (!app.isQuiting) {
    gracefulShutdown();
  }
});

// 当所有窗口关闭且应用即将退出时的额外清理
app.on('will-quit', (event) => {
  console.log("应用即将退出，执行最终检查");
  // 确保所有定时器都被清理
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (networkMonitorInterval) {
    clearInterval(networkMonitorInterval);
    networkMonitorInterval = null;
  }
});
