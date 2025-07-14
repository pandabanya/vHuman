import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import axios from 'axios'
import SocketService from "@/utils/ance-socket";
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css'; // 引入样式

Vue.use(ElementUI)
Vue.config.productionTip = false
Vue.prototype.$axios = axios
Vue.prototype.$ANCESocket = SocketService.Instance()


new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app')
