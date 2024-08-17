// import { define, observable, action, autorun, batch } from '@formily/reactive'
// import { observer } from '@formily/reactive-react'

// import React from 'react'
// class DomainModel {
//   deep = { aa: 1 }
//   shallow = {}
//   box = 0
//   ref = ''
//   num = 0

//   constructor() {
//     define(this, {
//       deep: observable,
//       shallow: observable.shallow,
//       box: observable.box,
//       ref: observable.ref,
//       num: observable.ref,
//       computed: observable.computed, // 源码比较复杂，最终实现和vue3的watchEffect一致
//       action,
//       batch,
//     })
//   }

//   get computed() {
//     console.log('执行计算啦', this.num, this.box.get())
//     return this.num + this.box.get()
//   }
//   action(num, box) {
//     this.num = num
//     this.box.set(box)
//   }
//   batch(num, box) {
//     this.num = num
//     this.box.set(box)
//   }
// }

// const model = new DomainModel()

// autorun(() => {
//   console.log('autorun', model.computed)
// })

// model.action(1, 2)
// model.action(2, 1) // 仍然会触发computed的重新计算
// model.batch(3, 4)

// const target = { num: 1 }
// const obs = observable(target)
// // autorun(() => {
// //   debugger
// //   console.log('autorun', obs.num)
// // })
// function Index() {
//   return (
//     <div
//       onClick={() => {
//         obs.num = new Date().getTime()
//       }}
//     >
//       demo5，define
//     </div>
//   )
// }
// // export default Index
// export default observer(Index)
