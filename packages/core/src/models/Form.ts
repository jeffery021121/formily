/* eslint-disable no-console */
import { define, observable, batch, action, observe } from '@formily/reactive'
import {
  FormPath,
  FormPathPattern,
  isValid,
  uid,
  globalThisPolyfill,
  merge,
  isPlainObj,
  isArr,
  isObj,
} from '@formily/shared'
import { Heart } from './Heart'
import { Field } from './Field'
import {
  JSXComponent,
  LifeCycleTypes,
  HeartSubscriber,
  FormPatternTypes,
  IFormRequests,
  IFormFeedback,
  ISearchFeedback,
  IFormGraph,
  IFormProps,
  IFieldResetOptions,
  IFormFields,
  IFieldFactoryProps,
  IVoidFieldFactoryProps,
  IFormState,
  IModelGetter,
  IModelSetter,
  IFieldStateGetter,
  IFieldStateSetter,
  FormDisplayTypes,
  IFormMergeStrategy,
} from '../types'
import {
  createStateGetter,
  createStateSetter,
  createBatchStateSetter,
  createBatchStateGetter,
  triggerFormInitialValuesChange,
  triggerFormValuesChange,
  batchValidate,
  batchReset,
  batchSubmit,
  setValidating,
  setSubmitting,
  setLoading,
  getValidFormValues,
} from '../shared/internals'
import { isVoidField } from '../shared/checkers'
import { runEffects } from '../shared/effective'
import { ArrayField } from './ArrayField'
import { ObjectField } from './ObjectField'
import { VoidField } from './VoidField'
import { Query } from './Query'
import { Graph } from './Graph'

const DEV_TOOLS_HOOK = '__FORMILY_DEV_TOOLS_HOOK__'

export class Form<ValueType extends object = any> {
  displayName = 'Form'
  id: string
  initialized: boolean
  validating: boolean
  submitting: boolean
  loading: boolean
  modified: boolean
  pattern: FormPatternTypes
  display: FormDisplayTypes
  values: ValueType
  initialValues: ValueType
  mounted: boolean
  unmounted: boolean
  props: IFormProps<ValueType>
  heart: Heart
  graph: Graph
  fields: IFormFields = {}
  requests: IFormRequests = {}
  indexes: Record<string, string> = {}
  disposers: (() => void)[] = []

  constructor(props: IFormProps<ValueType>) {
    this.initialize(props)
    this.makeObservable()
    this.makeReactive()
    this.makeValues()
    this.onInit()
  }

  protected initialize(props: IFormProps<ValueType>) {
    this.id = uid()
    this.props = { ...props }
    this.initialized = false
    this.submitting = false
    this.validating = false
    this.loading = false
    this.modified = false
    this.mounted = false
    this.unmounted = false
    this.display = this.props.display || 'visible'
    this.pattern = this.props.pattern || 'editable'
    this.editable = this.props.editable
    this.disabled = this.props.disabled
    this.readOnly = this.props.readOnly
    this.readPretty = this.props.readPretty
    this.visible = this.props.visible
    this.hidden = this.props.hidden
    this.graph = new Graph(this)
    this.heart = new Heart({
      lifecycles: this.lifecycles,
      context: this,
    })
  }

  protected makeValues() {
    this.values = getValidFormValues(this.props.values)
    this.initialValues = getValidFormValues(this.props.initialValues)
  }

  protected makeObservable() {
    define(this, {
      fields: observable.shallow,
      indexes: observable.shallow,
      initialized: observable.ref,
      validating: observable.ref,
      submitting: observable.ref,
      loading: observable.ref,
      modified: observable.ref,
      pattern: observable.ref,
      display: observable.ref,
      mounted: observable.ref,
      unmounted: observable.ref,
      values: observable,
      initialValues: observable,
      valid: observable.computed,
      invalid: observable.computed,
      errors: observable.computed,
      warnings: observable.computed,
      successes: observable.computed,
      // NOTE: 依赖display状态
      hidden: observable.computed,
      visible: observable.computed,
      // NOTE: 依赖pattern状态
      editable: observable.computed,
      readOnly: observable.computed,
      readPretty: observable.computed,
      disabled: observable.computed,

      //
      /**
       * NOTE:
       * 以下方法可能会触发响应式数据的getter，但getter触发时，若有外部reaction，不需要相互绑定。
       * 一般这些设置方法执行时是事件触发的，此时外部没有reaction，如果有，则参考下文分析
       * eg: react场景下 onFiledMount中调用setSubmitting(!field.submitting)，此时触发了field.submitting的getter和setter逻辑
       * 但如果其他地方没有用过field.submitting，那么这个属性的变化，就没必要触发组件的重新渲染，所以reaction此时不要手机依赖，即设计成action形式
       * action主要处理的是getter逻辑
       */
      setValues: action,
      setValuesIn: action,
      setInitialValues: action,
      setInitialValuesIn: action,
      setPattern: action,
      setDisplay: action,
      setState: action,
      deleteInitialValuesIn: action,
      deleteValuesIn: action,
      setSubmitting: action,
      setValidating: action,
      reset: action,
      submit: action,
      validate: action,

      /**
       *  NOTE:
       * 生命周期函数，会在render时执行，设置成batch，若生命周期内有多个响应式数据设置操作，等生命周期结束，才触发reaction执行。
       * 实际上在react组件都是异步render的情况下，这个batch可以省略。但是低版本react可能会出现同步render的情况，所以这里还是保留
       * batch主要处理的是setter逻辑
       * */
      onMount: batch,
      onUnmount: batch,
      onInit: batch,
    })
  }

  protected makeReactive() {
    this.disposers.push(
      observe(
        this,
        (change) => {
          // NOTE: form上任何响应式数据变化，都会触发这里，下面两个触发器会自动过滤不相关的响应式数据变化
          triggerFormInitialValuesChange(this, change)
          triggerFormValuesChange(this, change)
        },
        true
      )
    )
  }

  get valid() {
    return !this.invalid
  }

  get invalid() {
    return this.errors.length > 0
  }

  get errors() {
    return this.queryFeedbacks({
      type: 'error',
    })
  }

  get warnings() {
    return this.queryFeedbacks({
      type: 'warning',
    })
  }

  get successes() {
    return this.queryFeedbacks({
      type: 'success',
    })
  }

  get lifecycles() {
    return runEffects(this, this.props.effects)
  }

  get hidden() {
    return this.display === 'hidden'
  }

  get visible() {
    return this.display === 'visible'
  }

  set hidden(hidden: boolean) {
    if (!isValid(hidden)) return
    if (hidden) {
      this.display = 'hidden'
    } else {
      this.display = 'visible'
    }
  }

  set visible(visible: boolean) {
    if (!isValid(visible)) return
    if (visible) {
      this.display = 'visible'
    } else {
      this.display = 'none'
    }
  }

  get editable() {
    return this.pattern === 'editable'
  }

  set editable(editable) {
    if (!isValid(editable)) return
    if (editable) {
      // NOTE: 这里修改，会通知相关计算属性的reaction，导致计算属性重新计算
      this.pattern = 'editable'
    } else {
      this.pattern = 'readPretty'
    }
  }

  get readOnly() {
    return this.pattern === 'readOnly'
  }

  set readOnly(readOnly) {
    if (!isValid(readOnly)) return
    if (readOnly) {
      this.pattern = 'readOnly'
    } else {
      this.pattern = 'editable'
    }
  }

  get disabled() {
    return this.pattern === 'disabled'
  }

  set disabled(disabled) {
    if (!isValid(disabled)) return
    if (disabled) {
      this.pattern = 'disabled'
    } else {
      this.pattern = 'editable'
    }
  }

  get readPretty() {
    return this.pattern === 'readPretty'
  }

  set readPretty(readPretty) {
    if (!isValid(readPretty)) return
    if (readPretty) {
      this.pattern = 'readPretty'
    } else {
      this.pattern = 'editable'
    }
  }

  /** 创建字段 **/

  createField = <
    Decorator extends JSXComponent,
    Component extends JSXComponent
  >(
    props: IFieldFactoryProps<Decorator, Component>
  ): Field<Decorator, Component> => {
    const address = FormPath.parse(props.basePath).concat(props.name)
    const identifier = address.toString()
    if (!identifier) return
    if (!this.fields[identifier] || this.props.designable) {
      batch(() => {
        new Field(address, props, this, this.props.designable)
      })
      this.notify(LifeCycleTypes.ON_FORM_GRAPH_CHANGE)
    }
    return this.fields[identifier] as any
  }

  createArrayField = <
    Decorator extends JSXComponent,
    Component extends JSXComponent
  >(
    props: IFieldFactoryProps<Decorator, Component>
  ): ArrayField<Decorator, Component> => {
    const address = FormPath.parse(props.basePath).concat(props.name)
    const identifier = address.toString()
    if (!identifier) return
    if (!this.fields[identifier] || this.props.designable) {
      batch(() => {
        new ArrayField(
          address,
          {
            ...props,
            value: isArr(props.value) ? props.value : [],
          },
          this,
          this.props.designable
        )
      })
      this.notify(LifeCycleTypes.ON_FORM_GRAPH_CHANGE)
    }
    return this.fields[identifier] as any
  }

  createObjectField = <
    Decorator extends JSXComponent,
    Component extends JSXComponent
  >(
    props: IFieldFactoryProps<Decorator, Component>
  ): ObjectField<Decorator, Component> => {
    const address = FormPath.parse(props.basePath).concat(props.name)
    const identifier = address.toString()
    if (!identifier) return
    if (!this.fields[identifier] || this.props.designable) {
      batch(() => {
        new ObjectField(
          address,
          {
            ...props,
            value: isObj(props.value) ? props.value : {},
          },
          this,
          this.props.designable
        )
      })
      this.notify(LifeCycleTypes.ON_FORM_GRAPH_CHANGE)
    }
    return this.fields[identifier] as any
  }

  createVoidField = <
    Decorator extends JSXComponent,
    Component extends JSXComponent
  >(
    props: IVoidFieldFactoryProps<Decorator, Component>
  ): VoidField<Decorator, Component> => {
    const address = FormPath.parse(props.basePath).concat(props.name)
    const identifier = address.toString()
    if (!identifier) return
    if (!this.fields[identifier] || this.props.designable) {
      batch(() => {
        new VoidField(address, props, this, this.props.designable)
      })
      this.notify(LifeCycleTypes.ON_FORM_GRAPH_CHANGE)
    }
    return this.fields[identifier] as any
  }

  /** 状态操作模型 **/

  setValues = (values: any, strategy: IFormMergeStrategy = 'merge') => {
    if (!isPlainObj(values)) return
    if (strategy === 'merge' || strategy === 'deepMerge') {
      merge(this.values, values, {
        // never reach
        arrayMerge: (target, source) => source,
        assign: true,
      })
    } else if (strategy === 'shallowMerge') {
      Object.assign(this.values, values)
    } else {
      this.values = values as any
    }
  }

  setInitialValues = (
    initialValues: any,
    strategy: IFormMergeStrategy = 'merge'
  ) => {
    if (!isPlainObj(initialValues)) return
    if (strategy === 'merge' || strategy === 'deepMerge') {
      merge(this.initialValues, initialValues, {
        // never reach
        arrayMerge: (target, source) => source,
        assign: true,
      })
    } else if (strategy === 'shallowMerge') {
      Object.assign(this.initialValues, initialValues)
    } else {
      this.initialValues = initialValues as any
    }
  }

  setValuesIn = (pattern: FormPathPattern, value: any) => {
    FormPath.setIn(this.values, pattern, value)
  }

  deleteValuesIn = (pattern: FormPathPattern) => {
    FormPath.deleteIn(this.values, pattern)
  }

  existValuesIn = (pattern: FormPathPattern) => {
    return FormPath.existIn(this.values, pattern)
  }

  getValuesIn = (pattern: FormPathPattern) => {
    return FormPath.getIn(this.values, pattern)
  }

  setInitialValuesIn = (pattern: FormPathPattern, initialValue: any) => {
    FormPath.setIn(this.initialValues, pattern, initialValue)
  }

  deleteInitialValuesIn = (pattern: FormPathPattern) => {
    FormPath.deleteIn(this.initialValues, pattern)
  }

  existInitialValuesIn = (pattern: FormPathPattern) => {
    return FormPath.existIn(this.initialValues, pattern)
  }

  getInitialValuesIn = (pattern: FormPathPattern) => {
    return FormPath.getIn(this.initialValues, pattern)
  }

  setLoading = (loading: boolean) => {
    setLoading(this, loading)
  }

  setSubmitting = (submitting: boolean) => {
    setSubmitting(this, submitting)
  }

  setValidating = (validating: boolean) => {
    setValidating(this, validating)
  }

  setDisplay = (display: FormDisplayTypes) => {
    this.display = display
  }

  setPattern = (pattern: FormPatternTypes) => {
    this.pattern = pattern
  }

  addEffects = (id: any, effects: IFormProps['effects']) => {
    if (!this.heart.hasLifeCycles(id)) {
      this.heart.addLifeCycles(id, runEffects(this, effects))
    }
  }

  removeEffects = (id: any) => {
    this.heart.removeLifeCycles(id)
  }

  setEffects = (effects: IFormProps['effects']) => {
    this.heart.setLifeCycles(runEffects(this, effects))
  }

  clearErrors = (pattern: FormPathPattern = '*') => {
    this.query(pattern).forEach((field) => {
      if (!isVoidField(field)) {
        field.setFeedback({
          type: 'error',
          messages: [],
        })
      }
    })
  }

  clearWarnings = (pattern: FormPathPattern = '*') => {
    this.query(pattern).forEach((field) => {
      if (!isVoidField(field)) {
        field.setFeedback({
          type: 'warning',
          messages: [],
        })
      }
    })
  }

  clearSuccesses = (pattern: FormPathPattern = '*') => {
    this.query(pattern).forEach((field) => {
      if (!isVoidField(field)) {
        field.setFeedback({
          type: 'success',
          messages: [],
        })
      }
    })
  }

  query = (pattern: FormPathPattern): Query => {
    return new Query({
      pattern,
      base: '',
      form: this,
    })
  }

  queryFeedbacks = (search: ISearchFeedback): IFormFeedback[] => {
    return this.query(search.address || search.path || '*').reduce(
      (messages, field) => {
        if (isVoidField(field)) return messages
        return messages.concat(
          field
            .queryFeedbacks(search)
            .map((feedback) => ({
              ...feedback,
              address: field.address.toString(),
              path: field.path.toString(),
            }))
            .filter((feedback) => feedback.messages.length > 0)
        )
      },
      []
    )
  }

  notify = (type: string, payload?: any) => {
    this.heart.publish(type, payload ?? this)
  }

  subscribe = (subscriber?: HeartSubscriber) => {
    return this.heart.subscribe(subscriber)
  }

  unsubscribe = (id: number) => {
    this.heart.unsubscribe(id)
  }

  /**事件钩子**/

  onInit = () => {
    this.initialized = true
    this.notify(LifeCycleTypes.ON_FORM_INIT)
  }

  onMount = () => {
    this.mounted = true
    this.notify(LifeCycleTypes.ON_FORM_MOUNT)
    if (globalThisPolyfill[DEV_TOOLS_HOOK] && !this.props.designable) {
      globalThisPolyfill[DEV_TOOLS_HOOK].inject(this.id, this)
    }
  }

  onUnmount = () => {
    this.notify(LifeCycleTypes.ON_FORM_UNMOUNT)
    this.query('*').forEach((field) => field.destroy(false))
    this.disposers.forEach((dispose) => dispose())
    this.unmounted = true
    this.indexes = {}
    this.heart.clear()
    if (globalThisPolyfill[DEV_TOOLS_HOOK] && !this.props.designable) {
      globalThisPolyfill[DEV_TOOLS_HOOK].unmount(this.id)
    }
  }

  setState: IModelSetter<IFormState<ValueType>> = createStateSetter(this)

  getState: IModelGetter<IFormState<ValueType>> = createStateGetter(this)

  setFormState: IModelSetter<IFormState<ValueType>> = createStateSetter(this)

  getFormState: IModelGetter<IFormState<ValueType>> = createStateGetter(this)

  setFieldState: IFieldStateSetter = createBatchStateSetter(this)

  getFieldState: IFieldStateGetter = createBatchStateGetter(this)

  getFormGraph = () => {
    return this.graph.getGraph()
  }

  setFormGraph = (graph: IFormGraph) => {
    this.graph.setGraph(graph)
  }

  clearFormGraph = (pattern: FormPathPattern = '*', forceClear = true) => {
    this.query(pattern).forEach((field) => {
      field.destroy(forceClear)
    })
  }

  validate = (pattern: FormPathPattern = '*') => {
    return batchValidate(this, pattern)
  }

  submit = <T>(
    onSubmit?: (values: ValueType) => Promise<T> | void
  ): Promise<T> => {
    return batchSubmit(this, onSubmit)
  }

  reset = (pattern: FormPathPattern = '*', options?: IFieldResetOptions) => {
    return batchReset(this, pattern, options)
  }
}
