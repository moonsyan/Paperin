import React from 'react'

export function Icon({ name }: { name: string }): JSX.Element {
  return <svg className="icon" aria-hidden="true" viewBox="0 0 256 256"><use href={`#i-${name}`} /></svg>
}
