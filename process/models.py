"""
process/models.py
"""

from django.db import models

# Create your models here.

class Process(models.Model):
    '''a class for tracking a long-running process'''
    name = models.CharField(max_length=256)
    pid = models.IntegerField(default=0)
    exited = models.BooleanField(default=False)
    exitcode = models.IntegerField(default=0)
    statustext = models.CharField(max_length=256, default='')
    percentdone = models.IntegerField(default=0)
    

class CatalogState(models.Model):
    '''Singleton row tracking Stale Catalogs and the Makecatalogs worker.
    The catalogs are stale while `changes` > `built`.'''
    changes = models.BigIntegerField(default=0)
    built = models.BigIntegerField(default=0)
    requested = models.BooleanField(default=False)
    running_since = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default='')
