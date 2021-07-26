const $whitelist = [
  `https://hoppscotch.io`,
  `https://proxy.hoppscotch.io`
]
  
export default function (whitelist: string[], options?: any) {
  return {
    origin: (origin: string, callback: Function) => {
      const _whitelist = [ ...$whitelist, ...whitelist ]

      if (!origin || _whitelist.indexOf(origin) !== -1) {
        callback(null, true)
      } else {
        callback(new Error("CORS not allow for this origin"))
      }
    }
  }
}
