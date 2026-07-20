from django.db import migrations


def backfill(apps, schema_editor):
    """Give each existing Department/Skill the farm of the employees using it.

    These two tables had no owner column, so every tenant shared them. 0016 adds
    the farm FK; this fills it in from the only evidence available — who is
    actually in the department / tagged with the skill.

    A row used by employees on more than one farm is split: the original keeps
    the first farm and a copy is made per additional farm, with the employees
    repointed, so nobody silently loses a department they were using. A row with
    no employees at all cannot be attributed and is left NULL.
    """
    Department = apps.get_model("workforce", "Department")
    Skill = apps.get_model("workforce", "Skill")

    for dept in Department.objects.all():
        farm_ids = list(
            dept.employees.exclude(farm__isnull=True)
            .values_list("farm_id", flat=True).distinct()
        )
        if not farm_ids:
            continue
        dept.farm_id = farm_ids[0]
        dept.save(update_fields=["farm"])
        for extra in farm_ids[1:]:
            clone = Department.objects.create(
                farm_id=extra, name=dept.name, code=dept.code,
                description=dept.description,
            )
            dept.employees.filter(farm_id=extra).update(department=clone)

    for skill in Skill.objects.all():
        farm_ids = list(
            skill.employees.exclude(farm__isnull=True)
            .values_list("farm_id", flat=True).distinct()
        )
        if not farm_ids:
            continue
        skill.farm_id = farm_ids[0]
        skill.save(update_fields=["farm"])
        for extra in farm_ids[1:]:
            clone = Skill.objects.create(
                farm_id=extra, name=skill.name, category=skill.category,
            )
            for emp in skill.employees.filter(farm_id=extra):
                emp.skills.remove(skill)
                emp.skills.add(clone)


def unbackfill(apps, schema_editor):
    """Clearing the farm is enough to reverse; 0016 drops the column anyway."""
    apps.get_model("workforce", "Department").objects.update(farm=None)
    apps.get_model("workforce", "Skill").objects.update(farm=None)


class Migration(migrations.Migration):

    dependencies = [
        ("workforce", "0016_department_farm_skill_farm"),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
