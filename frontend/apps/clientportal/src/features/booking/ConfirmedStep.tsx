import { useNavigate } from 'react-router-dom';

export function ConfirmedStep() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto mt-16 max-w-md px-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Booked!</h1>
      <p className="mt-2 text-gray-500 dark:text-gray-400">See it under My Bookings.</p>
      <button
        type="button"
        onClick={() => navigate('/book')}
        className="mt-6 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white"
      >
        Book another
      </button>
    </div>
  );
}
