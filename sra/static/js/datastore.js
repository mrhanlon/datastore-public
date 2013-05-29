define(['jquery', 'underscore', 'backbone', 'utils'], function($, _, Backbone, Utils) {

var Datastore = {
    Models: {},
    Collections: {},
    Views: {},
    Events: {},
    Contexts: {}
};


Datastore.Models.Node = Backbone.Model.extend({  
    urlRoot: '/api/file',
    url: function() {
        console.log(this);
        return '/api/file' + '?path=' + encodeURIComponent(this.get('path'));
    },
    parse: function(obj) {
        r = {}
        if (obj.is_dir) {
            r.children = new Datastore.Collections.NodeCollection();
            r.children.url = '/api/collection?path=' + encodeURIComponent(obj.path);
        }
        //r.root_relative_path = obj.path.replace(root, '');
        console.log(obj.path);
        console.log(r.is_dir);
        if (obj.is_dir != undefined && obj.is_dir == false)
            r.download_url = '/download' + Utils.urlencode_path(obj.path);
            r.serve_url = '/serve' + Utils.urlencode_path(obj.path);

        r.metadata = Utils.metadata_to_object(obj.metadata);
        if (r.metadata[metadata_prefix])
            r.template_metadata = r.metadata[metadata_prefix];
        return _.extend(obj, r);
    },
    defaults: { 
        parent:	null
    }
}); 

Datastore.Collections.NodeCollection = Backbone.Collection.extend({
    model: Datastore.Models.Node,
    url: '/trellis-data/index.php/irods/nodes'
});

Datastore.Views.NodeListView = Backbone.View.extend({
    tagName: 'div',
    events: {
        'click li.dir a': 'open_file',
        'click li.file a': 'open_file'
    },
    initialize: function(options) {
        this.collection.bind('reset', _.bind(this.append_children, this));
    },
    render: function() {
        this.$el.append('loading');
        console.log(this.collection); 
        return this;
    },
    append_children: function() {
        this.$el.empty();
        $list = $("<ul>", {'class': 'node-list'});
        console.log(this);
        this.collection.each(function(node) {
            $("<li>")
                .data('model', node)
                .addClass(node.get('is_dir') ? 'dir' : 'file')
                .append($('<a>', {href: '#'}).append(node.get('name')))
                .appendTo($list);
        });
        this.$el.append($list);
        return this;
    },
    open_file: function(e) {
        var node = $(e.currentTarget).closest('li').data('model'); 
        console.log(node);
        Datastore.Events.Breadcrumbs.trigger('push', node);
    }
});

Datastore.Views.FileView = Backbone.View.extend({
    tagName: 'div',
    events: {},
    initialize: function(options) {
    }, 
    render: function() {
        this.$el.append(new Datastore.Views.DataObjectHeader({model: this.model}).render().el);
        this.$el.append(
            $("<dl>")
                .append($("<dt>").append("Checksum:"))
                .append($("<dd>").append(this.model.get('checksum')))
                .append($("<dt>").append("Created:"))
                .append($("<dd>").append(this.model.get('create_time')))
                .append($("<dt>").append("Last Modified:"))
                .append($("<dd>").append(this.model.get('modify_time')))
        );
        return this;
    }
});

Datastore.Events.Breadcrumbs = _.extend({}, Backbone.Events);

Datastore.Views.BreadcrumbView = Backbone.View.extend({
    events: {
        'click a': 'open_dir'
    },
    initialize: function() {
        Datastore.Events.Breadcrumbs.on('push', _.bind(this.push_dir, this));
        Datastore.Events.Breadcrumbs.on('pop', _.bind(this.pop_dir, this));
        //this.nodes = []
        this.$list = null;
    },
    render: function() {
        this.$list = $("<ul>", {'class': 'clearfix'});
        this.$el.append(this.$list);
        return this;
    },
    push_dir: function(model) {
        //this.nodes.push(model);
        $("<li>")
            .addClass(model.get('is_dir') ? 'dir' : 'file')
            .data('model', model)
            .append($('<a>', {href: '#'}).append(model.get('name')))
            .appendTo(this.$list);
    },
    pop_dir: function() {
        this.$list.children().last().remove();
    },
    open_dir: function(e) {
        li = $(e.currentTarget).closest('li');
        var index = this.$list.children().index(li);
        var len = this.$list.children().length;
        var pops = len - index - 1;
        for (i = 0; i < pops; i++)
            Datastore.Events.Breadcrumbs.trigger('pop');
    }
});

Datastore.Views.DataApp = Backbone.View.extend({
    events: {
    },
    initialize: function() {
        console.log('init data app');
        Datastore.Events.Breadcrumbs.on('push', _.bind(this.push_dir, this));
        Datastore.Events.Breadcrumbs.on('pop', _.bind(this.add_to_pop_queue, this));
        this.pop_queue = 0;
        this.popping = false;
    },
    push_dir: function(model) {
        console.log('pushdir data app');
        console.log(model);

        var self = this;
        model.fetch({
            success: function() {
                var new_width = (self.$el.children().length + 1) * 940;
                self.$el.width(new_width);

                console.log(model.get('metadata'));
                var template = model.get('template_metadata') ? model.get('template_metadata')['template'] : null;
                console.log(template);

                var append_view = function(view, options) {
                    console.log(view);
                    if (model.get('is_dir')) {
                        var new_view  = new view(_.extend({model: model, collection: model.get('children')}, options))
                        new_view.render().$el.appendTo(self.$el);
                        model.get('children').fetch();
                    } else {
                        var new_view  = new view(_.extend({model: model}, options))
                        new_view.render().$el.appendTo(self.$el);
                    }
                    if (template)
                        new_view.$el.addClass('template-' + template);
                    console.log(new_view.$el.position().left);
                    self.$el.parent().animate({
                        scrollLeft: new_view.$el.position().left
                    }, 'fast');
                };

                var view;
                console.log(model.get('is_dir'));
                if (template) {
                    require(['static/js/contexts/' + template + '.js'], function(Context) {
                        view = Context.Views.MainView;   
                        view_options = model.get('template_metadata')['template_options'] || {};
                        append_view(view, view_options);
                    });
                } else if (model.get('is_dir')) {
                    view = Datastore.Views.NodeListView;
                    append_view(view, {});
                } else {
                    view = Datastore.Views.FileView;
                    append_view(view, {});
                }
            }
        });
    },
    add_to_pop_queue: function() {
        this.pop_queue++; 
        if (!this.popping)
            this.pop_dir();
    },
    pop_dir: function() {
        this.popping = true;
        var self = this;
        this.$el.parent().animate(
            {scrollLeft: this.$el.children().last().prev().position().left}, 
            'slow', 
            function() {
                console.log('pop finished'); 
                self.$el.children().last().remove();
                var new_width = (self.$el.children().length) * 940;
                self.$el.width(new_width);
                self.pop_queue--;
                if (self.pop_queue > 0)
                   self.pop_dir(); 
                else
                    self.popping = false;
            }
        );
    },
    render: function() {
        console.log('render data app');
        return this;
    },
});

Datastore.Views.DataObjectHeader = Backbone.View.extend({
    tagName: 'div',
    className: 'data-object-header clearfix',
    initialize: function() {
    },
    render: function() {
        this.$el
            .append($("<ul>", {'class': 'file-properties'})
                .append($("<li>").append(this.model.get('name')))
                .append($("<li>").append(Utils.bytes_to_human(this.model.get('size'))))
            )
            .append($('<div>', {'class': 'file-action'})
                .append($("<div>", {'class': 'btn-group'})
                    .append(
                        $('<a>', {
                            'class': 'btn btn-primary', 
                            'type': 'button',
                            'href': this.model.get('download_url')
                        })
                            .append($('<i>', {'class': 'icon-circle-arrow-down icon-white'}))
                            .append(' Download')
                    )
                )
            );
        return this;
    }
});

Datastore.Router = Backbone.Router.extend({
    routes: {
        "": "index"
    },
    index: function() {
        this.baseNode = new Datastore.Models.Node({path: root, name: root_name, is_dir: true});
        this.dataApp = new Datastore.Views.DataApp({el: $('#file-scroller-inner')}).render();
        this.breadcrumb_view = new Datastore.Views.BreadcrumbView({el: $('#breadcrumbs')}).render();
        Datastore.Events.Breadcrumbs.trigger('push', this.baseNode);
    }
});

return Datastore;

});