const $whitelist = [
  `https://hoppscotch.io`,
  `https://proxy.hoppscotch.io`,
  `https://tokenine-nft-khonkaen.web.app`,
  `http://localhost:5001`
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
