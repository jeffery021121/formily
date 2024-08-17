/* eslint-disable no-console */
import { isFn, isStr, each } from '@formily/shared'
import { LifeCycleHandler, LifeCyclePayload } from '../types'

type LifeCycleParams<Payload> = Array<
  | string
  | LifeCycleHandler<Payload>
  | { [key: string]: LifeCycleHandler<Payload> }
>

/* 
  new LifeCycle(type, (payload, ctx) => {
      if (isFn(callback)) {
        callback(payload, ctx, ...GlobalState.context)(...args)
      }
    })
*/
export class LifeCycle<Payload = any> {
  private listener: LifeCyclePayload<Payload>

  // NOTE: 一般场景 params = [type = 'onFieldValueChange', effectHook = (payload, ctx) => { fieldEffectFn(payload, ctx, ...GlobalState.context)(...args) }]
  constructor(...params: LifeCycleParams<Payload>) {
    this.listener = this.buildListener(params)
  }
  buildListener = (params: any[]) => {
    // NOTE: 这里的payload和ctx是由notify方法传入的
    return function (payload: { type: string; payload: Payload }, ctx: any) {
      for (let index = 0; index < params.length; index++) {
        let item = params[index]
        if (isFn(item)) {
          item.call(this, payload, ctx)
        } else if (isStr(item) && isFn(params[index + 1])) {
          // NOTE: 只要有notify，那么form上注册的所有lifeCycle都会执行，在这里通过type判断，来决定effect函数是否执行
          if (item === payload.type) {
            params[index + 1].call(this, payload.payload, ctx)
          }
          index++
        } else {
          each<any, any>(item, (handler, type) => {
            if (isFn(handler) && isStr(type)) {
              if (type === payload.type) {
                handler.call(this, payload.payload, ctx)
                return false
              }
            }
          })
        }
      }
    }
  }

  notify = <Payload>(type: any, payload?: Payload, ctx?: any) => {
    if (isStr(type)) {
      this.listener.call(ctx, { type, payload }, ctx)
    }
  }
}
