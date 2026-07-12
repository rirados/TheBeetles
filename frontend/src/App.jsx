import { Outlet, NavLink } from "react-router-dom";

export default function App() {
  return (
    <div className="h-full flex flex-col">
      <header className="bg-[#0b1220] border-b border-[#1f2d4d] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-lg font-bold">
            🌊
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">
              Flood<span className="text-blue-400">Guardian</span>
            </div>
            <div className="text-[10px] text-gray-500 -mt-0.5">
              Flood-Aware Emergency Response Engine
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink
            to="/citizen"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-[#1a2541]"
              }`
            }
          >
            Citizen
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-[#1a2541]"
              }`
            }
          >
            Admin Control Room
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
