import Vue from 'vue'
import VueRouter from 'vue-router'
import VHuman from '../views/2d-human.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'home',
    component: VHuman
  },
]

const router = new VueRouter({
  routes
})

export default router
