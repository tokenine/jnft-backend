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