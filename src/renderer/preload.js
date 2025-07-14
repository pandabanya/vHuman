// preload.js (预加载脚本)
const { ipcRenderer } = require('electron');
// 在上下文隔离启用的情况下使用预加载
// const { contextBridge } = require('electron')

window.addEventListener('DOMContentLoaded', () => {
    //  监听主进程发送的心跳
    ipcRenderer.on('heartbeat', () => {
        ipcRenderer.send('heartbeat-response');
    });
});

// contextBridge.exposeInMainWorld('myAPI', {
//     sendMsgToWorker: (args) => ipcRenderer.send('window-message-from-renderer', args) ,
//     onNetworkStatusMsg: (callback) => {
//         ipcRenderer.on('network-status', (event, args) => {
//             callback(args)
//         })
//     },
//     onWorkerMsg: (callback) => {
//         ipcRenderer.on('message-from-worker', (event, args) => {
//             callback(args)
//         })
//     },
// })