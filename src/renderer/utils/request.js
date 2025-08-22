import axios from 'axios'
import { Notification, MessageBox, Message } from 'element-ui'
import { cancelPending, addPending } from '@/utils/cancelRequest'
import router from '@/router'
import CryptoJS from './crypto-js'

axios.defaults.headers['Content-Type'] = 'application/json;charset=utf-8'
// 创建axios实例
const service = axios.create({
  // axios中请求配置有baseURL选项，表示请求URL公共部分
  baseURL: process.env.VUE_APP_BASE_API,
  // 超时
  timeout: 600000
})

// request拦截器
service.interceptors.request.use(config => {
  // 是否需要设置 token
  const isToken = (config.headers || {}).isToken === false

  // 添加一下鉴权信息
  // 确保headers对象存在
  config.headers = config.headers || {};
  // 添加鉴权
  // 息
  config.headers['AppKey'] = process.env.VUE_APP_APP_KEY;
  config.headers['Timestamp'] = Date.now();
  config.headers['Signature'] = getSignature(Date.now());
  // if (getToken() && !isToken) {
  //   config.headers['Authorization'] = 'Bearer ' + getToken() // 让每个请求携带自定义token 请根据实际情况自行修改
  //   const currentMeta = router.app._router.history.current.meta
  //   if (currentMeta.menuId) config.headers['Menu-Id'] = currentMeta.menuId
  //   // console.info('----', router.app._router.history.current.path)
  // }

  // get请求映射params参数
  if (config.method === 'get' && config.params) {
    let url = config.url + '?';
    for (const propName of Object.keys(config.params)) {
      const value = config.params[propName];
      var part = encodeURIComponent(propName) + "=";
      if (value !== null && typeof(value) !== "undefined") {
        if (typeof value === 'object') {
          for (const key of Object.keys(value)) {
            let params = propName + '[' + key + ']';
            var subPart = encodeURIComponent(params) + "=";
            url += subPart + encodeURIComponent(value[key]) + "&";
          }
        } else {
          url += part + encodeURIComponent(value) + "&";
        }
      }
    }
    url = url.slice(0, -1);
    config.params = {};
    config.url = url;

    // 添加取消请求方法
    cancelPending(config)
    addPending(config)
  }
  return config
}, error => {
    console.log(error)
    Promise.reject(error)
})

// 响应拦截器
service.interceptors.response.use(res => {
    cancelPending(res)
    // 未设置状态码则默认成功状态
    const code = res.data.code || 200;
    // 获取错误信息
    const msg = res.data.msg
    if (code === 401) {
      // 特殊处理timestamp验证失败错误，交给组件处理
      // 使用正则表达式匹配错误信息，允许空格变化
      if (res.data && res.data.error && /timestamp\s+is\s+not\s+pass/.test(res.data.error)) {
        return Promise.reject(error);
      }
      MessageBox.confirm('登录状态已过期，您可以继续留在该页面，或者重新登录', '系统提示', {
          confirmButtonText: '重新登录',
          cancelButtonText: '取消',
          type: 'warning'
        }
      ).then(() => {
        store.dispatch('LogOut').then(() => {
          location.href = '/index';
        })
      }).catch(() => {});
      return Promise.reject()
    } else if (code === 500) {
      Message({
        message: msg,
        type: 'error'
      })
      return Promise.reject(new Error(msg))
    } else if (code !== 200) {
      Notification.error({
        title: msg
      })
      return Promise.reject('error')
    } else {
      return res.data
    }
  },
  error => {
    console.log('err' + error)
    let { message } = error;
    if (message == "Network Error") {
      message = "后端接口连接异常";
    }
    else if (message.includes("timeout")) {
      message = "系统接口请求超时";
    }
    else if (message.includes("Request failed with status code")) {
      message = "系统接口" + message.substr(message.length - 3) + "异常";
    }
    Message({
      message: message,
      type: 'error',
      duration: 5 * 1000
    })
    return Promise.reject(error)
  }
)

/**
 * 生成签名
 * @param {*} record 
 * @returns 
 */
function getSignature(record) {
  let PARAM = `AppKey=${process.env.VUE_APP_APP_KEY}&Timestamp=${record}`
  let ENCODEPARAM = encodeURI(PARAM)
  let SIGNATURESHA = CryptoJS.HmacSHA256(CryptoJS.enc.Utf8.parse(ENCODEPARAM), CryptoJS.enc.Utf8.parse(process.env.VUE_APP_APP_SECRET));
  let SIGNATURE = SIGNATURESHA.toString(CryptoJS.enc.Hex);
  return SIGNATURE
}

export default service
