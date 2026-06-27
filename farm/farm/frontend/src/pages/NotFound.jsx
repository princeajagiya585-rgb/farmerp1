import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center text-center">
      <h1 className="text-6xl font-bold text-brand-600">404</h1>
      <p className="mt-2 text-gray-500">Page not found.</p>
      <Link to="/" className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        Back to Dashboard
      </Link>
    </div>
  );
}
