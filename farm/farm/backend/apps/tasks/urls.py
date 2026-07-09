from rest_framework.routers import DefaultRouter

from .views import (
    TaskUpdateViewSet, TaskViewSet, TaskWorkSessionViewSet,
    TaskExecutionViewSet
)

router = DefaultRouter()
router.register("updates", TaskUpdateViewSet, basename="taskupdate")
router.register("sessions", TaskWorkSessionViewSet, basename="tasksession")
router.register("executions", TaskExecutionViewSet, basename="taskexecution")
router.register("", TaskViewSet, basename="task")

urlpatterns = router.urls
