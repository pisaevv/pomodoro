import { useState } from 'react'

// Replaces dc-runtime's `style` + `style-hover`: merges hoverStyle over style
// while the pointer is over the element.
export default function HoverButton({ style, hoverStyle, children, ...rest }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      {...rest}
      style={hover ? { ...style, ...hoverStyle } : style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  )
}
