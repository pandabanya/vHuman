const qs = require('qs');
const pending = new Map();
import axios from 'axios';
const CancelToken = axios.CancelToken;

/**
 * 添加pending请求
 *
 * **/
export const addPending = (config) => {
    const url = [config.method, config.url, qs.stringify(config.params), qs.stringify(config.data)].join('&');
    config.cancelToken = config.cancelToken || new CancelToken(c => {
        if (!pending.has(url)) {
            pending.set(url, c);
        }
    })
    console.log(url);
}

/**
 * 取消单个pending请求
 * **/
export const cancelPending = (config) => {
    const url = [config.method, config.url, qs.stringify(config.params), qs.stringify(config.data)].join('&');
    if (pending.has(url)) {
        const cancel = pending.get(url);
        cancel('cancel request');
        pending.delete(url);
    }
}
/**
 * 清空pending请求(退出页面时)
 * **/
export const clearAllPending = () => {
    for (const [url, cancel] of pending) {
        cancel('cancel request');
    }
    pending.clear();
}
