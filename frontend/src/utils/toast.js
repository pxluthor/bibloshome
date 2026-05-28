const listeners = [];

const emit = (type, message) => {
  listeners.forEach((listener) => listener({ type, message }));
};

export const toast = {
  success: (message) => emit("success", message),
  error: (message) => emit("error", message),
  info: (message) => emit("info", message),
};

export const subscribe = (listener) => {
  listeners.push(listener);

  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
};
