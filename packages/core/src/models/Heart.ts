import { isStr, isArr, Subscribable } from '@formily/shared'
import { LifeCycle } from './LifeCycle'
import { IHeartProps } from '../types'

/**
 * NOTE:
 * 一个form对应一个heart
 * heart管理form的所有lifecycles，包括内部lifecycles和外部lifecycles
 * lifecycles是通过effect转换过来的，使得effect可以接受notify传递的参数
 * 发布逻辑如下
 * form.notify ->
 * heart.publish ->
 * everyLifecycle.notify(每次publish，不管type是什么，都会触发所有lifeCycle的notify) ->
 * everyLifecycle.listener (每个listener执行时，都会判断type是否匹配，匹配则执行回调) ->
 * if(typeOk) effectHook(payload, ctx)(...args)
 * effectHook
 * */
export class Heart<Payload = any, Context = any> extends Subscribable {
  // NOTE: 通过构造函数传入的lifecycles，或者通过setLifeCycles方法设置的lifecycles
  lifecycles: LifeCycle<Payload>[] = []

  // NOTE: 通过addLifeCycles方法添加的lifecycles，会有唯一的id。设计成map，方便批量添加和删除lifecycles，也方便用户整理业务逻辑。
  outerLifecycles: Map<any, LifeCycle<Payload>[]> = new Map()

  context: Context

  constructor({ lifecycles, context }: IHeartProps<Context> = {}) {
    super()
    this.lifecycles = this.buildLifeCycles(lifecycles || [])
    this.context = context
  }

  buildLifeCycles = (lifecycles: LifeCycle[]) => {
    return lifecycles.reduce((buf, item) => {
      if (item instanceof LifeCycle) {
        return buf.concat(item)
      } else {
        if (isArr(item)) {
          return this.buildLifeCycles(item)
        } else if (typeof item === 'object') {
          this.context = item
          return buf
        }
        return buf
      }
    }, [])
  }

  addLifeCycles = (id: any, lifecycles: LifeCycle[] = []) => {
    const observers = this.buildLifeCycles(lifecycles)
    if (observers.length) {
      this.outerLifecycles.set(id, observers)
    }
  }

  hasLifeCycles = (id: any) => {
    return this.outerLifecycles.has(id)
  }

  removeLifeCycles = (id: any) => {
    this.outerLifecycles.delete(id)
  }

  setLifeCycles = (lifecycles: LifeCycle[] = []) => {
    this.lifecycles = this.buildLifeCycles(lifecycles)
  }

  publish = <P, C>(type: any, payload?: P, context?: C) => {
    if (isStr(type)) {
      this.lifecycles.forEach((lifecycle) => {
        lifecycle.notify(type, payload, context || this.context)
      })
      this.outerLifecycles.forEach((lifecycles) => {
        lifecycles.forEach((lifecycle) => {
          lifecycle.notify(type, payload, context || this.context)
        })
      })
      this.notify({
        type,
        payload,
      })
    }
  }

  clear = () => {
    this.lifecycles = []
    this.outerLifecycles.clear()
    this.unsubscribe()
  }
}
