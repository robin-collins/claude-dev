import React from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import App from "./App"
import reportWebVitals from "./reportWebVitals"
import "../../node_modules/@vscode/codicons/dist/codicon.css"

console.log("React app initializing...")

const rootElement = document.getElementById("root")
console.log("Root element:", rootElement)

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement)
  console.log("React root created")

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  console.log("App rendered")
} else {
  console.error("Root element not found")
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(console.log)
