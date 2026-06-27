from rest_framework.routers import DefaultRouter

from .views import TaskUpdateViewSet, TaskViewSet, TaskWorkSessionViewSet

router = DefaultRouter()
router.register("updates", TaskUpdateViewSet, basename="taskupdate")
router.register("sessions", TaskWorkSessionViewSet, basename="tasksession")
router.register("", TaskViewSet, basename="task")

urlpatterns = router.urls
