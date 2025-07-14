const env = process.env

const config = {
    host: '',
    baseUrl: ''
}

Object.assign(config, env)


// if (config.VUE_APP_ENV === 'development') {
//     config.host = config.VUE_APP_BASE_URL
// } else if (config.VUE_APP_ENV === 'production') {
//     config.host = 'http://192.168.1.1:8080'
// }

config.host = config.VUE_APP_BASE_URL

export default config
