const path = require("path"); // 引入Node.js的path模块，用于处理文件路径
/**
 * 定义路径别名
 * @param {*} dir 
 * @returns 
 */
function resolve(dir) {
  // __dirname: 当前文件所在目录的绝对路径
  // 将当前文件目录与传入的dir拼接成完整路径
  return path.join(__dirname, dir);
}

module.exports = {
  publicPath: "./", // 解决web页面打包后本地打开页面空白问题
  chainWebpack: (config) => {
    // 由于我们修改了渲染进程目录，修改'@'的alias ,将@别名指向src/renderer目录
    config.resolve.alias.set("@", resolve("src/renderer"));
  },
  pages: { // 配置多页面入口
    index: { // 主页面配置
      entry: "src/renderer/main.js", // 入口文件
      template: "public/index.html",// HTML模板
      filename: "index.html", // 输出文件名
      title: "小溪", // 页面标题
      chunks: ["chunk-vendors", "chunk-common", "index"], // 包含代码块
    },
    worker: {// 工作线程页面配置
      entry: 'src/worker/serialWorker.js',// 串口工作线程入口
      template: 'public/worker.html',// 工作线程HTML模板
      filename: 'worker.html' // 输出文件名
    }
  },
  pluginOptions: { // 插件
    electronBuilder: {// electron-builder配置
      mainProcessFile:"src/main/index.js", // 主进程入口文件
      mainProcessWatch:["src/main"], // 检测主进程文件在更改时将重新编译主进程并重新启动
      nodeIntegration:true,// 允许渲染进程使用Node.js API
      externals: ['serialport'],// 将serialport模块排除在Webpack打包之外
      preload:'src/renderer/preload.js', // 预加载脚本路径
      // builderOptions是electron的打包配置:(参考=>https://www.electron.build/configuration/configuration)
      builderOptions:{
        appId:process.env.VUE_APP_APPID,
        productName:process.env.VUE_APP_PRODUCTNAME,
        // 本来electron的name及version是读取package.json里面的值的,这里使用extraMetadata把这两个值注入进package.json
        extraMetadata: {
          name: process.env.VUE_APP_APPID.split(".").pop(),
          version: process.env.VUE_APP_VERSION,
        },
        asar: true, // 启用asar打包，将应用源码打包成单个文件
        directories: {
          output: "dist_electron",
          buildResources: "build",
          app: "dist_electron/bundled",
        },
        files: [
          {
            filter: ["**"],
          },
        ],
        extends: null,
        electronVersion: '31.0.2',// "13.6.9",
        nodeVersion: "16.20.2",
        // extraResources: [{
        //   from: 'libs/',
        //   to: './'
        // }],
        electronDownload: {  // Electron下载配置
          mirror: "https://mirrors.tuna.tsinghua.edu.cn/",
        },
        dmg: {
          contents: [
            {
              type: "link",
              path: "/Applications",
              x: 410,
              y: 150,
            },
            {
              type: "file",
              x: 130,
              y: 150,
            },
          ],
        },
        mac: {
          icon: "public/icons/icon.icns",
        },
        nsis: {
          oneClick:false, // 是否一键安装
          allowElevation:true, // 允许请求提升。 如果为false，则用户必须使用提升的权限重新启动安装程序。
          allowToChangeInstallationDirectory:true, // 允许修改安装目录
          installerIcon:"public/icon.ico",// 安装图标
          uninstallerIcon:"public/icon.ico",//卸载图标
          installerHeaderIcon:"public/icon.ico", // 安装时头部图标
          createDesktopShortcut: true, // 创建桌面图标
          createStartMenuShortcut:true,// 创建开始菜单图标
        },
        win: {
          target:"nsis",
          icon:"public/icon.ico",
          requestedExecutionLevel:"highestAvailable",
        },
        linux: {
          icon: "public/icons",
        },
        publish: {
          provider: "generic",
          url: "http://127.0.0.1",
        }
      }
    },
  },

};
