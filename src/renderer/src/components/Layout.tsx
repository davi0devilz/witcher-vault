import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import UpdateBanner from './UpdateBanner'

export default function Layout(): JSX.Element {
  return (
    <div className="flex h-screen w-screen bg-base-bg text-white">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-y-auto">
        <UpdateBanner />
        <div className="w-full px-8 py-8 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
