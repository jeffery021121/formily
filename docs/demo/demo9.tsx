import { Form, Select } from '@formily/antd'
import { createForm } from '@formily/core'
import { observer } from '@formily/reactive-react'
import React, { useMemo } from 'react'

function Index() {
  console.log('render_release_bound')
  const instanceForm = useMemo(
    () =>
      createForm({
        values: { a: { b: 2, c: [{ d: 1 }] } },
      }),
    []
  )

  return (
    <div
      onClick={function jefferyClick() {
        console.log(instanceForm.values)
      }}
    >
      demo9，react
      {instanceForm.values?.a.b}
      <Form form={instanceForm}>
        <Select
          name="a.b"
          dataSource={[
            { label: '1', value: 1 },
            { label: '2', value: 2 },
          ]}
        />
      </Form>
    </div>
  )
}
// export default Index
export default observer(Index)
