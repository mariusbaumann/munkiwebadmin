from rest_framework.serializers import ModelSerializer
from manifests.models import ManifestFile
from rest_framework import serializers

class ManifestSerializer(ModelSerializer):
    catalogs = serializers.ListField(child=serializers.CharField(), required=False)
    conditional_items = serializers.ListField(child=serializers.DictField(), required=False)
    default_installs = serializers.ListField(child=serializers.CharField(), required=False)
    featured_items = serializers.ListField(child=serializers.CharField(), required=False)
    included_manifests = serializers.ListField(child=serializers.CharField(), required=False)
    managed_installs = serializers.ListField(child=serializers.CharField(), required=False)
    managed_uninstalls = serializers.ListField(child=serializers.CharField(), required=False)
    managed_updates = serializers.ListField(child=serializers.CharField(), required=False)
    optional_installs = serializers.ListField(child=serializers.CharField(), required=False)
    
     
    
    display_name = serializers.CharField(required=False, allow_blank=True)
    class Meta:
        model = ManifestFile
        fields = [
            'catalogs',
            'conditional_items',
            'default_installs',
            'featured_items',
            'included_manifests',
            'managed_installs',
            'managed_uninstalls',
            'managed_updates',
            'optional_installs',
            'display_name'
        ]