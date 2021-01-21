import os
from os import environ 
from flask import Flask
from pathlib import Path
from .router import router

def create_app(test_config=None):
    # create and configure the app
    path = Path(__file__)
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(  
        SECRET_KEY=environ.get('SECRET_KEY'),
        API_KEY = environ.get('API_KEY'),
        DATABASE = os.path.join(app.instance_path, environ.get('DATABASE'))
    )
    if test_config is None:
        # load the instance config, if it exists, when not testing
        app.config.from_pyfile('config.py', silent=True)
    else:
        # load the test config if passed in
        app.config.from_mapping(test_config)

    # ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass
    
    # setup db
    from .db import connect_server
    dbConn = connect_server('localhost', environ.get('DATABASE_USER'), environ.get('DATABASE_PSW'), environ.get('DATABASE_NAME'))

    # blueprint for api routes
    app.register_blueprint(router)
    
    return app

app = create_app()