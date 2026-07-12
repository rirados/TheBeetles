import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./styles/index.css";
import App from "./App.jsx";
import CitizenPage from "./pages/CitizenPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/citizen" replace />} />
          <Route path="citizen" element={<CitizenPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
