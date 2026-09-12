import React from 'react'
import { createRoot } from 'react-dom/client'
import icons from '../quiet-workspace/icons.svg?raw'
import { Workbench } from './Workbench'
import './style.css'
import './overlays.css'

// 仅插入仓库内已许可的静态 Phosphor 图标，绝不接受用户 HTML。
document.body.insertAdjacentHTML('afterbegin', icons)
const root = document.getElementById('root')
if (!root) throw new Error('Missing demo root')
createRoot(root).render(<React.StrictMode><Workbench /></React.StrictMode>)
