import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout(): JSX.Element {
  return (
    <div className="flex h-screen w-screen bg-base-bg text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-8 py-8 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
