export interface I_SSEmessageObject {
  id?: string, 
  event?: string
  data: { [key: string]: any } | string | number
}
