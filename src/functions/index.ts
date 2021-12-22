import keccak from 'keccak';
export * from "./pubsub"

export function createResponseResult (actionResult: any) {
  let result_: any = { status: { code: 400 }, data: null }

  if (actionResult) {
    result_ = { ...result_, ...actionResult[0] }
  }

  return [ result_, actionResult[1] ]
}

export function replacer(key: string, value: any) {
  if(value instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(value.entries()), // or with spread: value: [...value]
    };
  } else {
    return value;
  }
}

export function reviver(key: string, value: any) {
  if (typeof value === 'object' && value !== null) {
    if (value.dataType === 'Map') {
      return new Map(value.value);
    }
  }
  return value
}


/* 
 //
 // Utilities
 //
*/

export function hashCreate(arg: string | string[], options = { digest: "hex" }): string {
  const content_ = Array.isArray(arg) ? arg.join("") : arg
  return keccak('keccak256').update(content_).digest(options.digest);
}
