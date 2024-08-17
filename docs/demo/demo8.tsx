// import { Form } from '@formily/antd'
// import {
//   ArrayField,
//   createForm,
//   onFieldInputValueChange,
//   onFormMount,
// } from '@formily/core'
// import { observer } from '@formily/reactive-react'
// import React, { useLayoutEffect, useMemo } from 'react'

// function Index() {
//   console.log('render_release_bound')
//   const [num, setNum] = React.useState(0)
//   const instanceForm = useMemo(
//     () =>
//       createForm({
//         values: { a: { b: 1 } },
//       }),
//     []
//   )
//   useLayoutEffect(() => {
//     instanceForm.addEffects('eff1', () => {
//       onFormMount(() => {
//         instanceForm.createArrayField({ name: 'arr', value: [1, 2, 3] })
//       })

//       onFieldInputValueChange('arr', () => {
//         debugger
//         console.log('onFieldInputValueChange', num)
//         setNum(num + 1)
//       })
//     })
//     return () => {
//       debugger

//       instanceForm.removeEffects('eff1')
//     }
//   }, [instanceForm, num])

//   return (
//     <div
//       onClick={function jefferyClick() {
//         // ;(instanceForm.values as any).arr.push(2)
//         window.requestAnimationFrame(() => {
//           ;(instanceForm.query('arr').take() as ArrayField).push(2)
//           console.log('instanceForm.values1234', instanceForm.values)
//           debugger
//         })
//       }}
//     >
//       demo8，lifeCycle，sync react effect
//       <Form form={instanceForm}></Form>
//     </div>
//   )
// }
// // export default Index
// export default observer(Index)

// // // const obj = { a: 1, b: { c: 2 } }

// // // const lifeCycles = new Map()
// // // lifeCycles.set('aa', obj)
// // // lifeCycles.forEach((value, key) => {
// // //   console.log('key', key, 'value', value)
// // //   debugger
// // //   lifeCycles.delete(key)
// // //   lifeCycles.set('aa', obj)
// // // })
