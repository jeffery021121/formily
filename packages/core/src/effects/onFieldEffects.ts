import { FormPath, isFn, toArr } from '@formily/shared'
import { autorun, reaction, batch } from '@formily/reactive'
import { Form } from '../models'
import {
  LifeCycleTypes,
  FormPathPattern,
  GeneralField,
  DataField,
  IFieldState,
} from '../types'
import { createEffectHook, useEffectForm } from '../shared/effective'

function createFieldEffect<Result extends GeneralField = GeneralField>(
  type: LifeCycleTypes
) {
  // NOTE: 这个createEffectHook第二个柯里化函数参数设计的不太合理，最好先接受用户订阅参数，再接受notify参数，这样更符合函数式编程的思想
  return createEffectHook(
    type,
    // notify时传入
    (field: Result, form: Form) =>
      (
        // 用户订阅时传入
        pattern: FormPathPattern,
        callback: (field: Result, form: Form) => void
      ) => {
        if (
          FormPath.parse(pattern).matchAliasGroup(field.address, field.path)
        ) {
          batch(() => {
            callback(field, form)
          })
        }
      }
  )
}

/**
 * NOTE: effect订阅发布流程
 * NOTE: 订阅流程
 * type -> createEffectHook(effectFn) -> effectHook
 * 用户侧执行(eg: onFieldValueChange(pattern, cb) )即 effectHook(...args) ->
 *  lifeCycle: {
 *      listener: (fireType, payload, ctx) => if(fireType === type) effectFn(payload, ctx)(...args),
 *      notify: (fireType, payload, ctx) => listener(fireType, payload, ctx)
 * }
 * GlobalState.lifecycles.push(lifeCycle)
 * 外部逻辑执行 Form.heart.addLifeCycles(id, GlobalState.lifecycles) 订阅逻辑完成
 *
 * 参数逻辑解析：
 * type由hook定义传入，eg: LifeCycleTypes.ON_FIELD_VALUE_CHANGE
 * effectFn ，effectHook定制逻辑，主要用来处理notify过来的payload，ctx以及用户参数args。以effectFn的不同，可以理解成不同的effectHook
 *    本文件中的effectFn是 fieldEffectFn: (field, form) => (pattern, callback) => { callback(field, form) }
 *    fieldEffectFn是一个柯里化函数
 *      1. 第一层接收field和form(其实就是标准化的payload和ctx)，
 *      2. 第二层接收pattern和callback(其实就是标准化的args)，其中第二层是由用户调用传入的
 * args是用户的传入，eg: onFieldInit('aa', (field, form) => {})，这里的两个参数 'aa' 和 (field, form) => {} 就是args
 * effectHook 是整合type，effectFn和args 的逻辑，其本身也是一个函数(上例中的onFieldValueChange就是一个effectHook)，主要作用有两个：
 *  1. 是给用户调用，柯里化用户参数，即args
 *  2. 是在用户调用时，把type，effectFn和args包装成一个lifeCycle，使之具有notify方法，此时用户逻辑被放入到lifeCycle.listener中
 *  3. 把lifeCycle放入到GlobalState.lifecycles中，GlobalState.lifecycles则会在后续逻辑中被放入到form的heart中
 *
 * NOTE: 发布流程
 * 发布逻辑是由heart管理的，heart管理着form上所有的lifeCycle。
 * 合适场景主动触发 form.notify(fireType, payload, ctx) ->
 * heart.publish(fireType, payload, ctx) ->
 * everyLifeCycle.notify(fireType, payload, ctx) ->
 * everyLifeCycle.listener(fireType, payload, ctx)->
 * if(fireType === type) effectFn(payload, ctx)(...args) // 这里的type,effectFn和args是在订阅逻辑中定义的
 */

const _onFieldInit = createFieldEffect(LifeCycleTypes.ON_FIELD_INIT)
export const onFieldMount = createFieldEffect(LifeCycleTypes.ON_FIELD_MOUNT)
export const onFieldUnmount = createFieldEffect(LifeCycleTypes.ON_FIELD_UNMOUNT)
export const onFieldValueChange = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_VALUE_CHANGE
)
export const onFieldInitialValueChange = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_INITIAL_VALUE_CHANGE
)
export const onFieldInputValueChange = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_INPUT_VALUE_CHANGE
)
export const onFieldValidateStart = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_VALIDATE_START
)
export const onFieldValidateEnd = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_VALIDATE_END
)
export const onFieldValidating = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_VALIDATING
)
export const onFieldValidateFailed = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_VALIDATE_FAILED
)
export const onFieldValidateSuccess = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_VALIDATE_SUCCESS
)
export const onFieldSubmit = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_SUBMIT
)
export const onFieldSubmitStart = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_SUBMIT_START
)
export const onFieldSubmitEnd = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_SUBMIT_END
)
export const onFieldSubmitValidateStart = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_SUBMIT_VALIDATE_START
)
export const onFieldSubmitValidateEnd = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_SUBMIT_VALIDATE_END
)
export const onFieldSubmitSuccess = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_SUBMIT_SUCCESS
)
export const onFieldSubmitFailed = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_SUBMIT_FAILED
)
export const onFieldSubmitValidateSuccess = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_SUBMIT_VALIDATE_SUCCESS
)
export const onFieldSubmitValidateFailed = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_SUBMIT_VALIDATE_FAILED
)
export const onFieldReset = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_RESET
)
export const onFieldLoading = createFieldEffect<DataField>(
  LifeCycleTypes.ON_FIELD_LOADING
)

export function onFieldInit(
  pattern: FormPathPattern,
  callback?: (field: GeneralField, form: Form) => void
) {
  const form = useEffectForm()
  const count = form.query(pattern).reduce((count, field) => {
    // NOTE: 如果能够查询到field，那么直接执行callback，因为field其实已经初始化过了
    callback(field, form)
    return count + 1
  }, 0)
  if (count === 0) {
    // NOTE: 如果查询不到field，那么就把callback包装成effectFn，放入到form的heart中，等待form.notify触发
    _onFieldInit(pattern, callback)
  }
}

export function onFieldReact(
  pattern: FormPathPattern,
  callback?: (field: GeneralField, form: Form) => void
) {
  onFieldInit(pattern, (field, form) => {
    field.disposers.push(
      autorun(() => {
        if (isFn(callback)) callback(field, form)
      })
    )
  })
}
export function onFieldChange(
  pattern: FormPathPattern,
  callback?: (field: GeneralField, form: Form) => void
): void
export function onFieldChange(
  pattern: FormPathPattern,
  watches: (keyof IFieldState)[],
  callback?: (field: GeneralField, form: Form) => void
): void
export function onFieldChange(
  pattern: FormPathPattern,
  watches: any,
  callback?: (field: GeneralField, form: Form) => void
): void {
  if (isFn(watches)) {
    // NOTE: 没传watches，那么第二个参数watches其实就是callback
    callback = watches
    watches = ['value']
  } else {
    watches = watches || ['value']
  }
  onFieldInit(pattern, (field, form) => {
    if (isFn(callback)) callback(field, form)
    const dispose = reaction(
      // NOTE: 和其他effect不同，onFieldChange通过reaction来实现数据变化监听
      () => {
        return toArr(watches).map((key) => {
          return field[key]
        })
      },
      () => {
        if (isFn(callback)) callback(field, form)
      }
    )
    field.disposers.push(dispose)
  })
}
