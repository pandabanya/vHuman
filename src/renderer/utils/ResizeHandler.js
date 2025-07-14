

const { body } = document
const WIDTH = 992 // refer to Bootstrap's responsive design

export default {
  data() {
    return {
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight
    }
  },
  // watch: {
  //   $route(route) {
  //     if (this.device === 'mobile' && this.sidebar.opened) {
  //       store.dispatch('app/closeSideBar', { withoutAnimation: false })
  //     }
  //   }
  // },
  beforeMount() {
    window.addEventListener('resize', this.$_resizeHandler)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.$_resizeHandler)
  },
  mounted() {
    const isMobile = this.$_isMobile()
    if (isMobile) {
      // store.dispatch('app/toggleDevice', 'mobile')
      // store.dispatch('app/closeSideBar', { withoutAnimation: true })
    }
    console.info("---width---", this.screenWidth)
    console.info("---height---", this.screenHeight)
  },
  methods: {
    // use $_ for mixins properties
    // https://vuejs.org/v2/style-guide/index.html#Private-property-names-essential
    $_isMobile() {
      const rect = body.getBoundingClientRect()
      return rect.width - 1 < WIDTH
    },
    $_resizeHandler() {
      this.screenWidth = window.innerWidth
      this.screenHeight = window.innerHeight
      console.info("---width---", this.screenWidth)
      console.info("---height---", this.screenHeight)
      if (!document.hidden) {
        const isMobile = this.$_isMobile()
        // store.dispatch('app/toggleDevice', isMobile ? 'mobile' : 'desktop')

        // if (isMobile) {
        //   store.dispatch('app/closeSideBar', { withoutAnimation: true })
        // }
      }
    }
  }
}
