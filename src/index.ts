import { createHttpServer } from "./http/server.js";
import { TaskService } from "./service/task-service.js";
import { MemoryTaskStore } from "./store/memory-task-store.js";

const service = new TaskService(new MemoryTaskStore());
const server = createHttpServer(service);

server.listen(3000, "127.0.0.1");
