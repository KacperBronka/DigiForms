import * as React from 'react'
import {classes, FieldLayout} from './shared'
import type {Field, WithRef} from './shared'

export const FileUpload: WithRef<Omit<Field<'input'>, 'type' | 'children'>, HTMLInputElement> =
    React.forwardRef(({label, hint, error, className, ...props}, ref) =>
        <FieldLayout id={props.id} label={label} hint={hint} error={error} required={props.required}
                     externalDescription={props['aria-describedby']}
                     render={description => <input {...props} ref={ref} type="file"
                                                   className={classes('gp-control', 'gp-file', className)}
                                                   aria-invalid={error ? true : props['aria-invalid']}
                                                   aria-describedby={description}/>}/>)
