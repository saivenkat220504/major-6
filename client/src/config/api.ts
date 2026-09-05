import axios from 'axios'

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'https://major-6-o85h.onrender.com').replace(/\/$/, '')
const useDevProxy = import.meta.env.DEV


axios.defaults.baseURL = useDevProxy ? '' : apiBaseUrl

const nativeFetch = window.fetch.bind(window)

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/api/') && !useDevProxy
    ? `${apiBaseUrl}${input}`
    : input

  return nativeFetch(url, init)
}) as typeof window.fetch
