import { useConversation } from '../context/ConversationContext.jsx';

const TASKS = [
  { id: 'create',    label: '➕ Create Expense',          desc: 'Log a new expense — profile pre-filled, just add details', tourId: 'task-create'    },
  { id: 'view',      label: '📋 View Expenses',            desc: 'See all your recorded expenses',                           tourId: 'task-view'      },
  { id: 'modify',    label: '✏️ Modify / Delete Expense',  desc: 'Change date or delete an expense — confirm before saving', tourId: 'task-modify'    },
  { id: 'analytics', label: '📊 View Analytics',           desc: 'Spending breakdown by category and time period',           tourId: 'task-analytics' },
];

export default function TaskMenu() {
  const { setTask } = useConversation();

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 sm:py-12">
      <h2 className="text-xl sm:text-2xl font-semibold text-gray-700 mb-1">What would you like to do?</h2>
      <p className="text-gray-400 mb-6 sm:mb-8 text-sm">Choose a task to get started</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-xl px-2">
        {TASKS.map((task) => (
          <button
            key={task.id}
            id={task.tourId}
            onClick={() => setTask(task.id)}
            className="flex flex-col items-start p-5 bg-white border border-gray-200 rounded-2xl
                       shadow-sm hover:shadow-md hover:border-blue-400 transition-all text-left"
          >
            <span className="text-lg font-medium text-gray-800">{task.label}</span>
            <span className="text-xs text-gray-400 mt-1">{task.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
