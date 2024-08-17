/* eslint-disable no-console */
import { isFn, isValid } from '@formily/shared'
import { LifeCycle, Form } from '../models'
import { AnyFunction } from '../types'
import { isForm } from './checkers'
import { GlobalState } from './constants'

export const createEffectHook = <
  F extends (payload: any, ...ctxs: any[]) => AnyFunction
>(
  type: string,
  callback?: F // callback是effectFn定义函数，接收notify传入的payload和ctx
) => {
  // NOTE: effectHook  =  effect2LifeCycle 在下文runEffects中调用，把转化的lifeCycle放入到GlobalState.lifecycles中
  return (
    // 用户订阅时传入
    ...args: Parameters<ReturnType<F>>
  ) => {
    if (GlobalState.effectStart) {
      GlobalState.lifecycles.push(
        new LifeCycle(
          type,
          (
            // notify时传入
            payload,
            ctx
          ) => {
            if (isFn(callback)) {
              // callback(...args)(payload, ctx, ...GlobalState.context) // NOTE: 这里的写法更符合函数式编程的思想
              callback(payload, ctx, ...GlobalState.context)(...args)
            }
          }
        )
      )
    } else {
      throw new Error(
        'Effect hooks cannot be used in asynchronous function body'
      )
    }
  }
}

export const createEffectContext = <T = any>(defaultValue?: T) => {
  let index: number
  return {
    provide(value?: T) {
      if (GlobalState.effectStart) {
        index = GlobalState.context.length
        GlobalState.context[index] = isValid(value) ? value : defaultValue
      } else {
        throw new Error(
          'Provide method cannot be used in asynchronous function body'
        )
      }
    },
    consume(): T {
      if (!GlobalState.effectStart) {
        throw new Error(
          'Consume method cannot be used in asynchronous function body'
        )
      }
      return GlobalState.context[index]
    },
  }
}

const FormEffectContext = createEffectContext<Form>()

export const useEffectForm = FormEffectContext.consume

/**
 * NOTE:
 * runEffects函数，在form.addEffects和field.addEffects中调用
 * 将用户传入的effect函数处理成LifeCycle实例，放入到GlobalState.lifecycles中
 * 在后续逻辑会把GlobalState.lifecycles加入到form的heart中
 */
export const runEffects = <Context>(
  context?: Context,
  ...args: ((context: Context) => void)[]
): LifeCycle[] => {
  GlobalState.lifecycles = []
  GlobalState.context = []
  GlobalState.effectStart = true
  GlobalState.effectEnd = false
  if (isForm(context)) {
    FormEffectContext.provide(context)
  }
  args.forEach((effects) => {
    if (isFn(effects)) {
      /**
       * NOTE: 这个effects实际上是form.addEffects或field.addEffects中传入的回调函数
       * eg: from.addEffects('eff1', () => { onFormMount(() => {}); onFieldValueChange(pattern, (field) => {}) })
       * args 长度为1 : [() => { onFormMount(() => {}); onFieldValueChange(pattern, (field) => {}) }]
       * 会触发onFormMount，onFieldValueChange等用户调用的注册函数，继而执行effect2LifeCycle逻辑，将effect函数转换成LifeCycle实例
       * 最终放入到GlobalState.lifecycles中，lifeCycle具有notify方法，会在form.publish时执行
       * */
      effects(context)
    }
  })
  GlobalState.context = []
  GlobalState.effectStart = false
  GlobalState.effectEnd = true
  return GlobalState.lifecycles
}
